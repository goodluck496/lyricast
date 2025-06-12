import { parentPort } from 'worker_threads';

parentPort?.on('message', (data) => {
  const result = `Обработано:::: ${data.text}`;
  parentPort?.postMessage(result);
});


