import { Component, inject, OnInit } from '@angular/core';
import { BridgeService } from '@lyri-cast/common-browser';

@Component({
  selector: 'lyri-test-page',
  standalone: true,
  imports: [],
  templateUrl: './test-page.component.html',
  styleUrl: './test-page.component.scss',
})
export class TestPageComponent implements OnInit {
  private bridgeSrv = inject(BridgeService);

  ngOnInit() {}
}
