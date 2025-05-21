import { encodeQR } from 'qr';

/**
 * Split a string into chunks of specified size
 */
export function chunkString(str: string, size: number): string[] {
  const chunks: string[] = [];
  let index = 0;
  while (index < str.length) {
    chunks.push(str.slice(index, index + size));
    index += size;
  }
  return chunks;
}

/**
 * Class to handle displaying QR codes in a cycling terminal UI
 */
export class QRCycleTUI {
  private qrChunks: string[] = [];
  private currentChunkIndex = 0;
  private intervalId: any = null;
  private cycleInterval = 5000; // 5 seconds per QR code
  private isRunning = false;
  
  constructor() {
    // Initialize here
  }

  /**
   * Initialize the TUI with QR data
   */
  public displayQRCodes(data: string, chunkSize = 500): void {
    // Split the data into chunks that can fit in QR codes
    this.qrChunks = chunkString(data, chunkSize).map((chunk, index, array) => {
      // Format: JSON with index/total for reassembly
      return JSON.stringify({
        index,
        total: array.length,
        data: chunk
      });
    });
    
    // Configure terminal
    process.stdin.setRawMode(true);
    process.stdin.setEncoding('utf8');
    
    // Set up keyboard handlers
    process.stdin.on('data', (key: any) => {
      // Check for exit keys
      if (key === 'q' || key === '\u0003') { // 'q' or CTRL+C
        this.stop();
        return;
      }
      
      // Navigation
      if (key === '\u001b[D') { // Left arrow
        this.previousChunk();
      } else if (key === '\u001b[C') { // Right arrow
        this.nextChunk();
      } else if (key === ' ') { // Space
        if (this.intervalId) {
          this.stopCycling();
        } else {
          this.startCycling();
        }
      }
    });
    
    // Show the first QR code
    this.isRunning = true;
    this.displayCurrentChunk();
    
    // Start cycling automatically
    this.startCycling();
  }

  /**
   * Display the current QR chunk
   */
  private displayCurrentChunk(): void {
    if (this.qrChunks.length === 0) return;

    const chunkContent = this.qrChunks[this.currentChunkIndex];
    try {
      // Clear console
      console.clear();
      
      // Display a border 
      const width = process.stdout.columns || 80;
      const border = '='.repeat(width - 2);
      
      console.log('╔' + border + '╗');
      
      // Generate and display QR code
      const qr = encodeQR(chunkContent, 'ascii');
      console.log(qr);
      
      // Display status and instructions
      const cycleStatus = this.intervalId ? 'ON' : 'OFF';
      const statusLine = ` QR ${this.currentChunkIndex + 1}/${this.qrChunks.length} | Auto-cycle: ${cycleStatus} | Q: Quit | Space: Toggle Auto-cycle | ←/→: Navigate`;
      
      console.log('╚' + border + '╝');
      console.log(statusLine);
      
    } catch (error) {
      console.error('Error generating QR code:', error);
    }
  }

  /**
   * Move to the next QR chunk
   */
  public nextChunk(): void {
    this.currentChunkIndex = (this.currentChunkIndex + 1) % this.qrChunks.length;
    this.displayCurrentChunk();
  }

  /**
   * Move to the previous QR chunk
   */
  public previousChunk(): void {
    this.currentChunkIndex = (this.currentChunkIndex - 1 + this.qrChunks.length) % this.qrChunks.length;
    this.displayCurrentChunk();
  }

  /**
   * Start automatic cycling of QR codes
   */
  public startCycling(): void {
    if (!this.intervalId) {
      this.intervalId = setInterval(() => {
        this.nextChunk();
      }, this.cycleInterval);
    }
  }

  /**
   * Stop automatic cycling of QR codes
   */
  public stopCycling(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.displayCurrentChunk(); // Update the display to show the new cycle status
    }
  }

  /**
   * Stop and clean up resources
   */
  public stop(): void {
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    // Restore terminal
    process.stdin.setRawMode(false);
    process.stdin.removeAllListeners('data');
    
    // Exit
    process.exit(0);
  }
}