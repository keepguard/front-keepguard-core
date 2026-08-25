export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  deviceType: string;
}

const DEVICE_ID_KEY = 'keepguard_device_id';
const DEVICE_NAME_KEY = 'keepguard_device_name';

export function getOrCreateDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      deviceId = 'dev_' + crypto.randomUUID();
    } else {
      deviceId = 'dev_' + 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

export function getDeviceName(): string {
  const cachedName = localStorage.getItem(DEVICE_NAME_KEY);
  if (cachedName) return cachedName;

  const ua = navigator.userAgent;
  let browser = 'Navegador Web';
  let os = 'Dispositivo';

  if (ua.includes('Win')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg')) browser = 'Edge';

  const name = `${browser} no ${os}`;
  localStorage.setItem(DEVICE_NAME_KEY, name);
  return name;
}

export function getDeviceType(): string {
  const ua = navigator.userAgent;
  if (/mobile/i.test(ua)) return 'MOBILE';
  if (/tablet|ipad/i.test(ua)) return 'TABLET';
  return 'DESKTOP';
}

export function getDeviceInfo(): DeviceInfo {
  return {
    deviceId: getOrCreateDeviceId(),
    deviceName: getDeviceName(),
    deviceType: getDeviceType(),
  };
}
