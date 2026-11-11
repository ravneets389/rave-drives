import type { Transport } from './transport';

/**
 * Web Bluetooth link to a BLE ELM327 adapter (Vgate iCar Pro 2S / vLinker and friends).
 * Vendors use different GATT layouts, so we try the known service UUIDs and then
 * pick whichever characteristics can notify and write.
 */
const KNOWN_SERVICES: BluetoothServiceUUID[] = [
  0x18f0,                                   // Vgate vLinker / iCar 2S
  0xfff0,                                   // many ELM327 BLE clones
  0xffe0,                                   // HM-10 style modules
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',   // common "OBDII" BLE profile
];

export class BleTransport implements Transport {
  readonly name: string;
  private dataCb: (s: string) => void = () => {};
  private discCb: () => void = () => {};
  private dec = new TextDecoder();
  private enc = new TextEncoder();

  private constructor(private device: BluetoothDevice, rx: BluetoothRemoteGATTCharacteristic, private tx: BluetoothRemoteGATTCharacteristic) {
    this.name = device.name || 'OBD adapter';
    rx.addEventListener('characteristicvaluechanged', (e) => {
      const dv = (e.target as BluetoothRemoteGATTCharacteristic).value!;
      this.dataCb(this.dec.decode(dv));
    });
    device.addEventListener('gattserverdisconnected', () => this.discCb());
  }

  static supported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  static async connect(): Promise<BleTransport> {
    if (!BleTransport.supported()) throw new Error('Web Bluetooth not available. Use Chrome on Android.');
    const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: KNOWN_SERVICES });
    const server = await device.gatt!.connect();
    for (const uuid of KNOWN_SERVICES) {
      let service: BluetoothRemoteGATTService;
      try { service = await server.getPrimaryService(uuid); } catch { continue; }
      const chars = await service.getCharacteristics();
      const rx = chars.find((c) => c.properties.notify || c.properties.indicate);
      const tx = chars.find((c) => c.properties.write || c.properties.writeWithoutResponse);
      if (rx && tx) {
        await rx.startNotifications();
        return new BleTransport(device, rx, tx);
      }
    }
    device.gatt!.disconnect();
    throw new Error(`"${device.name ?? 'device'}" isn't a supported OBD adapter`);
  }

  async send(text: string) {
    const bytes = this.enc.encode(text);
    for (let i = 0; i < bytes.length; i += 20) {
      const chunk = bytes.slice(i, i + 20);
      if (this.tx.properties.writeWithoutResponse) await this.tx.writeValueWithoutResponse(chunk);
      else await this.tx.writeValueWithResponse(chunk);
    }
  }

  onData(cb: (s: string) => void) { this.dataCb = cb; }
  onDisconnect(cb: () => void) { this.discCb = cb; }
  async close() { if (this.device.gatt?.connected) this.device.gatt.disconnect(); }
}
