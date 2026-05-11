import Docker from 'dockerode';

export interface DockerClient {
  pull(image: string): Promise<void>;
  createContainer(opts: unknown): Promise<{
    id: string;
    start(): Promise<void>;
    wait(): Promise<{ StatusCode: number }>;
    stop(opts?: { t: number }): Promise<void>;
    remove(opts?: { force: boolean }): Promise<void>;
    logs(opts: {
      stdout: boolean;
      stderr: boolean;
      follow: boolean;
    }): Promise<NodeJS.ReadableStream>;
  }>;
}

export function defaultClient(): DockerClient {
  const d = new Docker();
  return {
    pull(image: string): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        void d.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
          if (err) return reject(err);
          d.modem.followProgress(stream, (progressErr: Error | null) => {
            if (progressErr) reject(progressErr);
            else resolve();
          });
        });
      });
    },
    createContainer: d.createContainer.bind(d) as DockerClient['createContainer'],
  };
}
