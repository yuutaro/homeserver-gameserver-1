import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Docker from 'dockerode';

type ServiceStatus = 'running' | 'exited' | 'not_found' | 'unknown';

@Injectable()
export class DockerOpsService {
  private docker: Docker;
  private allowServices: Set<string>;

  constructor(private readonly config: ConfigService) {
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
    this.allowServices = new Set(
      (this.config.get<string>('DOCKER_ALLOW_SERVICES') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }

  private ensureAllowed(service: string) {
    if (this.allowServices.size === 0) return;
    if (!this.allowServices.has(service)) {
      throw new Error(`Service not allowed: ${service}`);
    }
  }

  private async findComposeContainerId(service: string): Promise<string | null> {
    const containers = await this.docker.listContainers({
      all: true,
      filters: {
        label: [`com.docker.compose.service=${service}`],
      } as any,
    });
    if (containers.length === 0) return null;
    return containers[0].Id ?? null;
  }

  async getServiceStatus(service: string): Promise<ServiceStatus> {
    this.ensureAllowed(service);
    const containerId = await this.findComposeContainerId(service);
    if (!containerId) return 'not_found';
    const container = this.docker.getContainer(containerId);
    const inspect = await container.inspect();
    const state = inspect?.State;
    if (!state) return 'unknown';
    if (state.Running) return 'running';
    if (state.Status === 'exited') return 'exited';
    return 'unknown';
  }

  async startService(service: string) {
    this.ensureAllowed(service);
    const containerId = await this.findComposeContainerId(service);
    if (!containerId) throw new Error(`Container not found for service: ${service}`);
    await this.docker.getContainer(containerId).start();
  }

  async stopService(service: string) {
    this.ensureAllowed(service);
    const containerId = await this.findComposeContainerId(service);
    if (!containerId) throw new Error(`Container not found for service: ${service}`);
    await this.docker.getContainer(containerId).stop();
  }

  async restartService(service: string) {
    this.ensureAllowed(service);
    const containerId = await this.findComposeContainerId(service);
    if (!containerId) throw new Error(`Container not found for service: ${service}`);
    await this.docker.getContainer(containerId).restart();
  }
}

