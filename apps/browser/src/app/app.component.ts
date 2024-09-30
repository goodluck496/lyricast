import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { BridgeService } from '../services/bridge.service';

@Component({
  standalone: true,
  imports: [RouterModule],
  selector: 'lyri-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  //не удалять
  brige = inject(BridgeService)
}
