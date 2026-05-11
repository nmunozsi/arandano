import Docker from 'dockerode';

export interface DockerClient {
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
  return d as unknown as DockerClient;
}
