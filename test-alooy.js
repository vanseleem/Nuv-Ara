const { getStreams } = require('./providers/alooytv.js');

async function test() {
  console.log('=== ALOOYTV TEST ===');

  const streams = await getStreams(
    '292793',
    'tv',
    1,
    30
  );

  console.log('\nFOUND:', streams.length);

  streams.forEach((s, i) => {
    console.log('\n[' + (i + 1) + ']');
    console.log('name:', s.name);
    console.log('title:', s.title);
    console.log('quality:', s.quality);
    console.log('url:', s.url);
  });
}

test().catch(console.error);
