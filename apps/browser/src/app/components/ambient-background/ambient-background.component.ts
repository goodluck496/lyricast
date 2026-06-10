import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  OnInit,
  effect,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';
import {
  AmbientBackgroundManager,
  AmbientBackgroundPreset,
} from '@lyri-cast/common-browser';

interface Point {
  x: number;
  y: number;
}

interface BlobState {
  reaction: number;
  hue: number;
  offsetX: number;
  offsetY: number;
}

interface DrifterModel {
  id: string;
  hue: number;
  amplitude: number;
  speed: number;
  style: string;
}

interface StaticBlobConfig {
  id: string;
  radius: number;
  hue: number;
  orbitRadiusX: number;
  orbitRadiusY: number;
  orbitSpeed: number;
  orbitPhase: number;
  spiralAmplitude: number;
  spiralSpeed: number;
  repelStrength: number;
}

@Component({
  selector: 'lyri-ambient-background',
  standalone: true,
  templateUrl: './ambient-background.component.html',
  styleUrl: './ambient-background.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AmbientBackgroundComponent implements OnInit {
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  readonly ambientBackground = inject(AmbientBackgroundManager);

  readonly drifters = this.createDrifters();

  private readonly blobStates = new Map<string, BlobState>();
  private readonly staticBlobs: StaticBlobConfig[] = [
    {
      id: '1',
      radius: 420,
      hue: 198,
      orbitRadiusX: 190,
      orbitRadiusY: 128,
      orbitSpeed: 0.000085,
      orbitPhase: 0.4,
      spiralAmplitude: 34,
      spiralSpeed: 0.00011,
      repelStrength: 48,
    },
    {
      id: '2',
      radius: 390,
      hue: 166,
      orbitRadiusX: 154,
      orbitRadiusY: 176,
      orbitSpeed: -0.000072,
      orbitPhase: 2.1,
      spiralAmplitude: 28,
      spiralSpeed: 0.00009,
      repelStrength: 44,
    },
    {
      id: '3',
      radius: 460,
      hue: 222,
      orbitRadiusX: 118,
      orbitRadiusY: 210,
      orbitSpeed: 0.000064,
      orbitPhase: 4.2,
      spiralAmplitude: 42,
      spiralSpeed: 0.000075,
      repelStrength: 54,
    },
  ];

  private target: Point = { x: 0, y: 0 };
  private current: Point = { x: 0, y: 0 };
  private velocity: Point = { x: 0, y: 0 };
  private viewport: Point = { x: 0, y: 0 };
  private animationFrameId: number | null = null;
  private lastTimestamp = 0;
  private elapsedMs = 0;

  constructor() {
    effect(() => {
      this.applyPreset(this.ambientBackground.getPreset());
    });
  }

  ngOnInit(): void {
    this.zone.runOutsideAngular(() => {
      this.syncViewport();
      this.resetPointerToCenter();
      this.applyBaseStyles();
      this.bindPointerTracking();
      this.startAnimationLoop();
    });
  }

  private bindPointerTracking(): void {
    fromEvent<PointerEvent>(window, 'pointermove', { passive: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        this.target = { x: event.clientX, y: event.clientY };
      });

    fromEvent(window, 'pointerleave')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.resetPointerToCenter());

    fromEvent(window, 'resize', { passive: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncViewport());
  }

  private syncViewport(): void {
    this.viewport = {
      x: window.innerWidth,
      y: window.innerHeight,
    };
  }

  private resetPointerToCenter(): void {
    const center = {
      x: this.viewport.x / 2,
      y: this.viewport.y / 2,
    };

    this.target = center;
    this.current = center;
    this.velocity = { x: 0, y: 0 };

    this.writeHostStyle('--cursor-x', `${center.x}px`);
    this.writeHostStyle('--cursor-y', `${center.y}px`);
  }

  private applyBaseStyles(): void {
    for (const blob of this.staticBlobs) {
      this.blobStates.set(blob.id, {
        reaction: 0,
        hue: blob.hue,
        offsetX: 0,
        offsetY: 0,
      });
      this.writeHostStyle(`--blob-${blob.id}-x`, '50%');
      this.writeHostStyle(`--blob-${blob.id}-y`, '50%');
      this.writeHostStyle(`--blob-${blob.id}-hue`, `${blob.hue}`);
      this.writeHostStyle(`--blob-${blob.id}-react`, '0');
      this.writeHostStyle(`--blob-${blob.id}-offset-x`, '0px');
      this.writeHostStyle(`--blob-${blob.id}-offset-y`, '0px');
    }

    for (const drifter of this.drifters) {
      this.writeHostStyle(`--drifter-${drifter.id}-hue`, `${drifter.hue}`);
      this.writeHostStyle(`--drifter-${drifter.id}-alpha`, '0.2');
      this.writeHostStyle(`--drifter-${drifter.id}-scale`, '1');
    }
  }

  private applyPreset(preset: AmbientBackgroundPreset): void {
    this.writeHostStyle('--preset-cursor-hue', `${preset.cursorHue}`);
    this.writeHostStyle('--preset-cursor-accent-hue', `${preset.cursorAccentHue}`);

    this.staticBlobs.forEach((blob, index) => {
      const hue = preset.staticHues[index];
      blob.hue = hue;
      const state = this.blobStates.get(blob.id);
      if (state) {
        state.hue = hue;
      }
      this.writeHostStyle(`--blob-${blob.id}-hue`, `${hue}`);
    });

    this.drifters.forEach((drifter, index) => {
      const hue = preset.drifterHues[index] ?? preset.drifterHues[index % preset.drifterHues.length];
      drifter.hue = hue;
      this.writeHostStyle(`--drifter-${drifter.id}-hue`, `${hue}`);
    });
  }

  private startAnimationLoop(): void {
    const frame = (timestamp: number) => {
      if (this.lastTimestamp === 0) {
        this.lastTimestamp = timestamp;
      }

      const delta = Math.min(timestamp - this.lastTimestamp, 32);
      this.lastTimestamp = timestamp;

      this.tick(delta);
      this.animationFrameId = window.requestAnimationFrame(frame);
    };

    this.animationFrameId = window.requestAnimationFrame(frame);
    this.destroyRef.onDestroy(() => {
      if (this.animationFrameId !== null) {
        window.cancelAnimationFrame(this.animationFrameId);
      }
    });
  }

  private tick(deltaMs: number): void {
    const dt = Math.max(deltaMs, 8) / 16.6667;
    this.elapsedMs += deltaMs;
    const previous = { ...this.current };
    const spring = 0.012;
    const damping = 0.9;

    this.velocity = {
      x: (this.velocity.x + (this.target.x - this.current.x) * spring * dt) * damping,
      y: (this.velocity.y + (this.target.y - this.current.y) * spring * dt) * damping,
    };

    this.current = {
      x: this.current.x + this.velocity.x * dt,
      y: this.current.y + this.velocity.y * dt,
    };

    const dx = this.current.x - previous.x;
    const dy = this.current.y - previous.y;
    const speed = Math.hypot(dx, dy);
    const speedFactor = this.clamp((speed - 0.35) / 18, 0, 1);
    const stretch = 0.04 + speedFactor * 0.08;

    this.writeHostStyle('--cursor-x', `${this.current.x}px`);
    this.writeHostStyle('--cursor-y', `${this.current.y}px`);
    this.writeHostStyle('--cursor-scale-x', `${1 + stretch}`);
    this.writeHostStyle('--cursor-scale-y', `${1 - stretch * 0.18}`);
    this.writeHostStyle('--cursor-flow', `${speedFactor.toFixed(3)}`);

    for (const blob of this.staticBlobs) {
      const state = this.blobStates.get(blob.id);

      if (!state) {
        continue;
      }

      const orbitAngle = this.elapsedMs * blob.orbitSpeed + blob.orbitPhase;
      const spiralPulse =
        Math.sin(this.elapsedMs * blob.spiralSpeed + blob.orbitPhase * 1.7) *
        blob.spiralAmplitude;
      const orbitRadiusX = blob.orbitRadiusX + spiralPulse;
      const orbitRadiusY = blob.orbitRadiusY + spiralPulse * 0.82;
      const driftOffsetX = Math.cos(orbitAngle) * orbitRadiusX;
      const driftOffsetY = Math.sin(orbitAngle) * orbitRadiusY;
      const centerX = this.viewport.x * 0.5;
      const centerY = this.viewport.y * 0.5;

      const blobPosition = {
        x: centerX + driftOffsetX,
        y: centerY + driftOffsetY,
      };
      const distance = Math.hypot(
        this.current.x - blobPosition.x,
        this.current.y - blobPosition.y
      );
      const targetReaction = this.clamp(1 - distance / blob.radius, 0, 1);
      const repelRatio = this.clamp(1 - distance / (blob.radius * 0.82), 0, 1);
      const repelMagnitude = Math.pow(repelRatio, 2) * blob.repelStrength;
      const directionX =
        distance > 0.001 ? (blobPosition.x - this.current.x) / distance : 0;
      const directionY =
        distance > 0.001 ? (blobPosition.y - this.current.y) / distance : 0;
      const targetOffsetX = driftOffsetX + directionX * repelMagnitude;
      const targetOffsetY = driftOffsetY + directionY * repelMagnitude;

      state.reaction += (targetReaction - state.reaction) * 0.1 * dt;
      state.hue += (blob.hue + state.reaction * 42 - state.hue) * 0.12 * dt;
      state.offsetX += (targetOffsetX - state.offsetX) * 0.055 * dt;
      state.offsetY += (targetOffsetY - state.offsetY) * 0.055 * dt;

      this.writeHostStyle(`--blob-${blob.id}-react`, state.reaction.toFixed(4));
      this.writeHostStyle(`--blob-${blob.id}-hue`, state.hue.toFixed(2));
      this.writeHostStyle(
        `--blob-${blob.id}-offset-x`,
        `${state.offsetX.toFixed(2)}px`
      );
      this.writeHostStyle(
        `--blob-${blob.id}-offset-y`,
        `${state.offsetY.toFixed(2)}px`
      );
    }

    for (const drifter of this.drifters) {
      const wave = Math.sin(this.elapsedMs * drifter.speed + Number(drifter.id));
      const hue = drifter.hue + wave * drifter.amplitude;
      const alpha = 0.12 + ((wave + 1) / 2) * 0.14;
      const scale = 0.94 + ((wave + 1) / 2) * 0.16;

      this.writeHostStyle(`--drifter-${drifter.id}-hue`, hue.toFixed(2));
      this.writeHostStyle(`--drifter-${drifter.id}-alpha`, alpha.toFixed(3));
      this.writeHostStyle(`--drifter-${drifter.id}-scale`, scale.toFixed(3));
    }
  }

  private createDrifters(): DrifterModel[] {
    const total = 12;

    return Array.from({ length: total }, (_, index) => {
      const id = String(index + 1);
      const angle = (Math.PI * 2 * index) / total;
      const offsetX = this.randomBetween(-10, 10);
      const offsetY = this.randomBetween(-12, 12);
      const x = this.clamp(50 + Math.cos(angle) * 34 + offsetX, 6, 88);
      const y = this.clamp(50 + Math.sin(angle) * 30 + offsetY, 8, 88);
      const widthRem = this.randomBetween(12, 24);
      const heightRem = this.randomBetween(10, 20);
      const driftXRem = this.randomBetween(-2.2, 2.2);
      const driftYRem = this.randomBetween(-2, 2);
      const durationMs = this.randomBetween(32000, 56000);
      const phase = this.randomBetween(0, Math.PI * 2);
      const lightness = this.randomBetween(38, 46);
      const saturation = this.randomBetween(34, 44);

      return {
        id,
        hue: 180 + index * 7,
        amplitude: this.randomBetween(8, 15),
        speed: this.randomBetween(0.0001, 0.00022),
        style: [
          `left:${x}%`,
          `top:${y}%`,
          `width:${widthRem}rem`,
          `height:${heightRem}rem`,
          `--drifter-${id}-dx:${driftXRem}rem`,
          `--drifter-${id}-dy:${driftYRem}rem`,
          `--drifter-${id}-duration:${durationMs}ms`,
          `--drifter-${id}-phase:${phase}rad`,
          `--drifter-${id}-lightness:${lightness}%`,
          `--drifter-${id}-saturation:${saturation}%`,
        ].join(';'),
      };
    });
  }

  private randomBetween(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private writeHostStyle(name: string, value: string): void {
    this.elementRef.nativeElement.style.setProperty(name, value);
  }
}
