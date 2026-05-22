import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ColorPickerModule } from 'primeng/colorpicker';
import type { ColorPickerChangeEvent } from 'primeng/types/colorpicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { AssetDto } from '@lyri-cast/entities';
import { Subject, timer } from 'rxjs';
import { map, switchMap, takeUntil } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  CASTING_APPEARANCE_UPDATE_EVENT,
  CastingAppearance,
  CastingAppearanceScope,
  CastingAppearanceService,
  BridgeService,
} from '@lyri-cast/common-browser';
import { AssetPickerComponent } from '../asset-picker/asset-picker.component';

@Component({
  selector: 'lyri-casting-appearance-controls',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    ColorPickerModule,
    DialogModule,
    InputNumberModule,
    SelectModule,
    ToggleButtonModule,
    AssetPickerComponent,
  ],
  templateUrl: './casting-appearance-controls.component.html',
  styleUrl: './casting-appearance-controls.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CastingAppearanceControlsComponent {
  private readonly appearanceService = inject(CastingAppearanceService);
  private readonly bridge = inject(BridgeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly colorBridgeUpdates$ = new Subject<CastingAppearance>();
  private readonly colorBridgeCommits$ = new Subject<void>();

  readonly scope = input<CastingAppearanceScope>('songs');
  readonly appearance = computed(() =>
    this.appearanceService.appearanceFor(this.scope())()
  );
  backgroundDialogVisible = false;

  constructor() {
    this.colorBridgeUpdates$
      .pipe(
        switchMap((appearance) =>
          timer(180).pipe(
            map(() => appearance),
            takeUntil(this.colorBridgeCommits$)
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((appearance) => {
        this.bridge.send(CASTING_APPEARANCE_UPDATE_EVENT, appearance);
      });
  }

  readonly fontOptions = [
    { label: 'Sans Serif', value: 'sans-serif' },
    { label: 'Font-1', value: 'Font-1' },
    { label: 'Font-2', value: 'Font-2' },
    { label: 'Font-3', value: 'Font-3' },
    { label: 'Font-4', value: 'Font-4' },
    { label: 'Font-5', value: 'Font-5' },
    { label: 'Inter', value: 'Inter, system-ui, sans-serif' },
    { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
    { label: 'Georgia', value: 'Georgia, serif' },
    { label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
    { label: 'Segoe UI', value: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" },
  ];

  getFontOptionFamily(font: string | null | undefined): string {
    return font || 'sans-serif';
  }

  getFontOptionLabel(value: string | { label?: string; value?: string } | null): string {
    if (!value) {
      return '';
    }

    if (typeof value !== 'string') {
      return value.label ?? value.value ?? '';
    }

    return this.fontOptions.find((option) => option.value === value)?.label ?? value;
  }

  update(patch: Partial<CastingAppearance>): void {
    this.colorBridgeCommits$.next();
    const next = this.appearanceService.update(patch, this.scope());
    this.bridge.send(CASTING_APPEARANCE_UPDATE_EVENT, next);
  }

  updateColor(
    key: 'textColor' | 'shadowColor' | 'backgroundColor',
    event: ColorPickerChangeEvent
  ): void {
    const color = this.normalizePickerColor(event.value);
    if (!color) {
      return;
    }

    if (key === 'textColor') {
      this.updateLiveColor({ textColor: color });
      return;
    }

    if (key === 'shadowColor') {
      this.updateLiveColor({ shadowColor: color });
      return;
    }

    this.updateLiveColor({ backgroundColor: color });
  }

  commitColorUpdate(): void {
    this.colorBridgeCommits$.next();
    this.bridge.send(CASTING_APPEARANCE_UPDATE_EVENT, this.appearance());
  }

  onAssetSelected(selection: { asset: AssetDto; url: string }): void {
    this.update({
      backgroundAssetId: selection.asset.id,
      backgroundImageUrl: selection.url,
    });
    this.backgroundDialogVisible = false;
  }

  onResetBackground(): void {
    const next = this.appearanceService.resetBackground(this.scope());
    this.bridge.send(CASTING_APPEARANCE_UPDATE_EVENT, next);
  }

  private normalizePickerColor(value: string | object): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const color = value.startsWith('#') ? value : `#${value}`;
    return /^#[0-9a-f]{6}$/i.test(color) ? color : null;
  }

  private updateLiveColor(patch: Partial<CastingAppearance>): void {
    const next = this.appearanceService.update(patch, this.scope());
    this.colorBridgeUpdates$.next(next);
  }
}
