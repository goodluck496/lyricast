import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

// Initialize appearance (theme and font) as early as possible
(() => {
  if (typeof document === 'undefined') {
    return;
  }

  const html = document.documentElement;
  const body = document.body;

  try {
    const storedTheme = localStorage.getItem('lyricast.theme');
    if (storedTheme === 'dark') {
      html.classList.add('my-app-dark');
    } else if (storedTheme === 'light') {
      html.classList.remove('my-app-dark');
    }

    const storedFont = localStorage.getItem('lyricast.font');
    if (storedFont) {
      if (storedFont === 'sans-serif') {
        body.style.fontFamily = 'sans-serif';
      } else {
        body.style.fontFamily = `"${storedFont}", sans-serif`;
      }
    }
  } catch {
    // ignore storage errors in bootstrap
  }
})();

bootstrapApplication(AppComponent, appConfig).catch((err) =>
  console.error(err)
);
