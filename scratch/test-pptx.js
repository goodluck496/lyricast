const PptxGenJS = require('pptxgenjs');
const fs = require('fs');

async function test() {
  const pptx = new PptxGenJS();
  const slide = pptx.addSlide();
  slide.addText('Hello World', { x: 1, y: 1, w: 5, h: 1, fontSize: 24, color: '00FF00' });
  
  const buffer = await pptx.write({ outputType: 'nodebuffer' });
  fs.writeFileSync('test.pptx', buffer);
  console.log('Done, buffer size:', buffer.length);
}

test();
