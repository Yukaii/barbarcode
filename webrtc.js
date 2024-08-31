import SimplePeer from 'simple-peer';
import wrtc from '@koush/wrtc';

export function initializeWebRTC(onData) {
  console.log('Initializing SimplePeer...');
  const peer = new SimplePeer({
    initiator: true,
    trickle: false,
    wrtc: wrtc
  });

  peer.on('signal', (data) => {
    console.log('WebRTC offer generated. Access the QR code at /qr');
    console.log('Offer details:', JSON.stringify(data, null, 2));
  });

  peer.on('connect', () => {
    console.log('WebRTC connection established');
  });

  peer.on('data', onData);

  peer.on('error', (err) => {
    console.error('SimplePeer error:', err);
  });

  peer.on('close', () => {
    console.log('SimplePeer connection closed');
  });

  return peer;
}