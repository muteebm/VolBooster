import nativeSoundMixer from 'native-sound-mixer';
const SoundMixer = nativeSoundMixer.default;
const DeviceType = nativeSoundMixer.DeviceType;
console.log('SoundMixer:', typeof SoundMixer);
console.log('devices exists:', !!SoundMixer.devices);
console.log('devices:', typeof SoundMixer.devices);
