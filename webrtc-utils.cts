import nodeDataChannel from 'node-datachannel';
import { networkInterfaces } from 'node:os';

// Function to generate a random string for ICE credentials
export function randomBase64(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return result;
}

// Function to get local IP address
export function getLocalIpAddress(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    // biome-ignore lint/style/noNonNullAssertion: <explanation>
    for (const net of nets[name]!) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// Class to handle WebRTC server setup and communication
export class WebRTCServer {
  private peerConnection: any;
  private dataChannel: any;
  private certificate: any;
  private fingerprint: string;
  private iceUfrag: string;
  private icePwd: string;
  private port: number;
  private hostname: string;
  private answerSdp: string;
  private onMessageCallback: (message: any) => void;

  constructor(port = 5000, onMessage: (message: any) => void) {
    this.port = port;
    this.hostname = getLocalIpAddress();
    this.onMessageCallback = onMessage;

    // Generate ICE credentials
    this.iceUfrag = randomBase64(4);
    this.icePwd = randomBase64(24);
    
    // Generate certificate
    this.certificate = nodeDataChannel.createCertificate({ days: 1 });
    this.fingerprint = this.certificate.fingerprint;
    
    // Create answer SDP
    this.answerSdp = this.createAnswerSdp();
    
    // Set up peer connection
    this.setupPeerConnection();
  }

  private setupPeerConnection() {
    try {
      // Initialize the peer connection with ICE lite
      this.peerConnection = new nodeDataChannel.PeerConnection("srv", { 
        iceServers: [],
        iceLite: true
      });
      
      // Set certificate
      this.peerConnection.setCertificate(this.certificate);
      
      // Add local port
      this.peerConnection.addLocalPort(this.port);
      
      console.log(`WebRTC server initialized with ICE ufrag: ${this.iceUfrag}, pwd: ${this.icePwd}`);
      console.log(`Certificate fingerprint: ${this.fingerprint}`);
      console.log(`Bound to port ${this.port} on ${this.hostname}`);

      // Handle data channel messages
      this.peerConnection.onDataChannel((dc: any) => {
        console.log(`Data channel opened: ${dc.getLabel()}`);
        this.dataChannel = dc;

        dc.onMessage((message: string) => {
          try {
            const parsedMessage = JSON.parse(message);
            this.onMessageCallback(parsedMessage);
          } catch (error) {
            console.error('Error processing message:', error);
          }
        });

        dc.onClosed(() => {
          console.log('Data channel closed');
        });
      });

    } catch (error) {
      console.error('Error setting up WebRTC peer connection:', error);
    }
  }

  private createAnswerSdp(): string {
    // Create SDP answer template as specified in the requirements
    return `v=0
o=- 1 1 IN IP4 0.0.0.0
s=-
t=0 0
a=fingerprint:sha-256 ${this.fingerprint}
a=group:BUNDLE 0
a=ice-lite
m=application 9 DTLS/SCTP 5000
c=IN IP4 0.0.0.0
a=setup:active
a=mid:0
a=sendrecv
a=sctpmap:5000 webrtc-datachannel 1024
a=ice-ufrag:${this.iceUfrag}
a=ice-pwd:${this.icePwd}
a=candidate:foundation 1 udp 2130706431 ${this.hostname} ${this.port} typ host generation 0
a=end-of-candidates`;
  }

  public getAnswerSdp(): string {
    return this.answerSdp;
  }

  public getIceCredentials(): { ufrag: string; pwd: string } {
    return { ufrag: this.iceUfrag, pwd: this.icePwd };
  }

  public sendMessage(message: any): void {
    if (this.dataChannel && this.dataChannel.isOpen()) {
      try {
        this.dataChannel.sendMessage(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending message over data channel:', error);
      }
    } else {
      console.warn('Data channel not open, cannot send message');
    }
  }

  public close(): void {
    if (this.dataChannel) {
      this.dataChannel.close();
    }
    if (this.peerConnection) {
      this.peerConnection.close();
    }
  }
}