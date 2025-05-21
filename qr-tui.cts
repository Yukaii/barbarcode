import blessed from 'blessed';
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
  private screen: blessed.Widgets.Screen;
  private box: blessed.Widgets.BoxElement;
  private statusBar: blessed.Widgets.BoxElement;
  private qrChunks: string[] = [];
  private currentChunkIndex = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private cycleInterval = 5000; // 5 seconds per QR code

  constructor() {
    // Initialize blessed screen
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'barbarcode QR Cycle',
    });

    // Create a box for displaying QR codes
    this.box = blessed.box({
      top: 'center',
      left: 'center',
      width: '80%',
      height: '90%',
      content: '',
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        fg: 'white',
        border: {
          fg: '#f0f0f0',
        },
      },
    });

    // Create a status bar
    this.statusBar = blessed.box({
      bottom: 0,
      left: 'center',
      width: '100%',
      height: 1,
      content: 'Press Q to quit, Left/Right arrows to navigate QR codes',
      tags: true,
      style: {
        fg: 'white',
        bg: 'blue',
      },
    });

    // Add components to screen
    this.screen.append(this.box);
    this.screen.append(this.statusBar);

    // Handle key events
    this.screen.key(['escape', 'q', 'C-c'], () => {
      this.stop();
      process.exit(0);
    });

    this.screen.key(['left'], () => {
      this.previousChunk();
    });

    this.screen.key(['right'], () => {
      this.nextChunk();
    });

    this.screen.key(['space'], () => {
      if (this.intervalId) {
        this.stopCycling();
      } else {
        this.startCycling();
      }
    });
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

    // Show the first chunk
    this.displayCurrentChunk();
    
    // Start cycling automatically
    this.startCycling();
    
    // Render the screen
    this.screen.render();
  }

  /**
   * Display the current QR chunk
   */
  private displayCurrentChunk(): void {
    if (this.qrChunks.length === 0) return;

    const chunkContent = this.qrChunks[this.currentChunkIndex];
    try {
      // Generate QR code
      const qr = encodeQR(chunkContent, 'ascii');
      
      // Update the box content with QR code
      this.box.setContent(`${qr}\n\n QR Code ${this.currentChunkIndex + 1}/${this.qrChunks.length}`);
      
      // Update status bar
      this.updateStatusBar();
      
      // Render the screen
      this.screen.render();
    } catch (error) {
      console.error('Error generating QR code:', error);
      this.box.setContent(`Error generating QR code: ${error}`);
      this.screen.render();
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
   * Update the status bar
   */
  private updateStatusBar(): void {
    const cycleStatus = this.intervalId ? 'ON' : 'OFF';
    this.statusBar.setContent(
      ` QR ${this.currentChunkIndex + 1}/${this.qrChunks.length} | Auto-cycle: ${cycleStatus} | Q: Quit | Space: Toggle Auto-cycle | ←/→: Navigate`
    );
  }

  /**
   * Start automatic cycling of QR codes
   */
  public startCycling(): void {
    if (!this.intervalId) {
      this.intervalId = setInterval(() => {
        this.nextChunk();
      }, this.cycleInterval);
      this.updateStatusBar();
    }
  }

  /**
   * Stop automatic cycling of QR codes
   */
  public stopCycling(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.updateStatusBar();
    }
  }

  /**
   * Stop and clean up resources
   */
  public stop(): void {
    this.stopCycling();
    this.screen.destroy();
  }
}