import React, { useState, useEffect, useRef } from 'react';
import { render, Box, Text, useInput, measureElement, Newline } from 'ink';
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

interface QRDisplayProps {
  qrChunks: string[];
  onExit: () => void;
}

const QRDisplay: React.FC<QRDisplayProps> = ({ qrChunks, onExit }) => {
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [cycling, setCycling] = useState(true);
  const [qrCode, setQRCode] = useState('');
  const [qrHeight, setQrHeight] = useState(0);
  const qrBoxRef = useRef<any>(null);
  const cycleInterval = 5000; // 5 seconds per QR code

  // Generate QR code for current chunk
  useEffect(() => {
    if (qrChunks.length === 0) return;
    
    try {
      const qr = encodeQR(qrChunks[currentChunkIndex], 'ascii');
      setQRCode(qr);
    } catch (error) {
      console.error('Error generating QR code:', error);
      setQRCode(`Error generating QR code: ${error}`);
    }
  }, [qrChunks, currentChunkIndex]);

  // Measure QR code box height
  useEffect(() => {
    if (qrBoxRef.current) {
      const { height } = measureElement(qrBoxRef.current);
      setQrHeight(height);
    }
  }, [qrCode]);

  // Handle keyboard input
  useInput((input: string, key: any) => {
    if (input === 'q' || key.escape) {
      onExit();
    } else if (key.leftArrow) {
      setCurrentChunkIndex((prev: number) => 
        (prev - 1 + qrChunks.length) % qrChunks.length
      );
    } else if (key.rightArrow) {
      setCurrentChunkIndex((prev: number) => 
        (prev + 1) % qrChunks.length
      );
    } else if (input === ' ') {
      setCycling((prev: boolean) => !prev);
    }
  });

  // Auto-cycling
  useEffect(() => {
    if (!cycling || qrChunks.length <= 1) return;
    
    const intervalId = setInterval(() => {
      setCurrentChunkIndex((prev: number) => (prev + 1) % qrChunks.length);
    }, cycleInterval);
    
    return () => clearInterval(intervalId);
  }, [cycling, qrChunks.length, cycleInterval]);

  // Split QR code into lines
  const qrLines = qrCode.split('\n');
  const isTruncated = qrHeight > 0 && qrLines.length > qrHeight;

  return (
    <Box flexDirection="column" padding={1} height={process.stdout.rows}>
      <Box 
        borderStyle="classic"
        borderColor="green"
        padding={0}
        marginBottom={0}
        flexGrow={1}
        flexDirection="column"
        ref={qrBoxRef}
      >
        <Text bold>
          QR Code {currentChunkIndex + 1}/{qrChunks.length}
        </Text>
        {isTruncated && (
          <>
            <Newline />
            <Text color="red" bold>
              Warning: Terminal not tall enough! Increase terminal height to display the full QR code for scanning.
            </Text>
          </>
        )}
        <Newline />
        {qrLines.map((line: string, idx: number) => (
          <Text key={idx}>{line === "" ? " " : line}</Text>
        ))}
      </Box>
      
      <Box 
        height={1}
        width="100%"
        backgroundColor="blue"
      >
        <Text>
          {` QR ${currentChunkIndex + 1}/${qrChunks.length} | Auto-cycle: ${cycling ? 'ON' : 'OFF'} | Q: Quit | Space: Toggle Auto-cycle | ←/→: Navigate`}
        </Text>
      </Box>
    </Box>
  );
};

/**
 * Class to handle displaying QR codes in a cycling terminal UI
 * (Maintains same API as the original blessed implementation but uses ink internally)
 */
export class QRCycleTUI {
  private qrChunks: string[] = [];
  private cleanup: () => void = () => {};

  constructor() {
    // Nothing to initialize here - we'll setup ink on displayQRCodes
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

    // Render Ink app
    const { unmount } = render(
      <QRDisplay 
        qrChunks={this.qrChunks} 
        onExit={() => this.stop()} 
      />
    );

    // Save cleanup function
    this.cleanup = unmount;
  }

  /**
   * Stop and clean up resources
   */
  public stop(): void {
    this.cleanup();
    process.exit(0);
  }

  // The following methods are kept for API compatibility but are no longer used
  // as the functionality is now handled by the React component

  public nextChunk(): void {
    // Handled by the React component
  }

  public previousChunk(): void {
    // Handled by the React component
  }

  public startCycling(): void {
    // Handled by the React component
  }

  public stopCycling(): void {
    // Handled by the React component
  }
}

/**
 * Class to handle displaying QR codes in a cycling terminal UI
 * (Maintains same API as the original blessed implementation but uses ink internally)
 */
export class QRCycleTUI {
  private qrChunks: string[] = [];
  private cleanup: () => void = () => {};

  constructor() {
    // Nothing to initialize here - we'll setup ink on displayQRCodes
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

    // Render Ink app
    const { unmount } = render(
      <QRDisplay 
        qrChunks={this.qrChunks} 
        onExit={() => this.stop()} 
      />
    );

    // Save cleanup function
    this.cleanup = unmount;
  }

  /**
   * Stop and clean up resources
   */
  public stop(): void {
    this.cleanup();
    process.exit(0);
  }

  // The following methods are kept for API compatibility but are no longer used
  // as the functionality is now handled by the React component

  public nextChunk(): void {
    // Handled by the React component
  }

  public previousChunk(): void {
    // Handled by the React component
  }

  public startCycling(): void {
    // Handled by the React component
  }

  public stopCycling(): void {
    // Handled by the React component
  }
}