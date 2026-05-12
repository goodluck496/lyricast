import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ColorPickerModule } from 'primeng/colorpicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { AssetDto } from '@lyri-cast/entities';
import {
  CASTING_APPEARANCE_UPDATE_EVENT,
  CastingAppearance,
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

  readonly appearance = this.appearanceService.appearance;
  backgroundDialogVisible = false;

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
    const next = this.appearanceService.update(patch);
    this.bridge.send(CASTING_APPEARANCE_UPDATE_EVENT, next);
  }

  onAssetSelected(selection: { asset: AssetDto; url: string }): void {
    this.update({
      backgroundAssetId: selection.asset.id,
      backgroundImageUrl: selection.url,
    });
    this.backgroundDialogVisible = false;
  }

  onResetBackground(): void {
    const next = this.appearanceService.resetBackground();
    this.bridge.send(CASTING_APPEARANCE_UPDATE_EVENT, next);
  }
}
