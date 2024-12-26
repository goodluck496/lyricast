import { Component, inject, OnInit } from '@angular/core';
import { SongsApiService } from '../../../services/songs-api.service';
import { DropdownModule } from 'primeng/dropdown';
import { AsyncPipe, JsonPipe } from '@angular/common';

@Component({
  selector: 'lyri-test-page',
  standalone: true,
  imports: [DropdownModule, AsyncPipe, JsonPipe],
  templateUrl: './test-page.component.html',
  styleUrl: './test-page.component.scss',
})
export class TestPageComponent implements OnInit {
  public songsService = inject(SongsApiService);

  songsList$ = this.songsService.getAllSongsByBook({
    fileKey: 'pesn_vozrojdeniya',
    humanName: 'pesn_vozrojdeniya'
  });

  ngOnInit() {}
}
