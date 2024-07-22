

// const dataRaw = [["4x-6x-6x-Jx-Jx:",{"infoSet":"4x-6x-6x-Jx-Jx:","regretSum":[-25.663496843300617,-916.0795534707287,1.9989505560145713],"strategy":[0,0,1],"strategySum":[0.7556131260794471,1.773786506255969,39180.47060036767]}],["2x-2x-5x-7x-Tx:p",{"infoSet":"2x-2x-5x-7x-Tx:p","regretSum":[28.49662631878106,-3267.67582951046,28.49662631878106],"strategy":[0.5,0,0.5],"strategySum":[103596.10648593583,1385.7870281283654,103596.10648593583]}],["4x-6x-6x-Jx-Jx:pb",{"infoSet":"4x-6x-6x-Jx-Jx:pb","regretSum":[-1163.2816658502575,-1000.398437423911,35.96382916399922],"strategy":[0,0,1],"strategySum":[1206.3952338241559,0.22164488252690845,37974.60933478706]}],["2x-2x-5x-7x-Tx:pbb",{"infoSet":"2x-2x-5x-7x-Tx:pbb","regretSum":[68.45413107863396,-248.5742456444641,-1466.6708603976788],"strategy":[1,0,0],"strategySum":[572.1967410965527,500.57874177317615,313.0115452586348]}],["4x-6x-6x-Jx-Jx:pbbb",{"infoSet":"4x-6x-6x-Jx-Jx:pbbb","regretSum":[67.27659579405186,-1494.4359279353976,-1756.3334658935619],"strategy":[1,0,0],"strategySum":[0.08090414178616777,0.10370370370370362,0.037037037037037035]}],["2x-2x-5x-7x-Tx:pbbbb",{"infoSet":"2x-2x-5x-7x-Tx:pbbbb","regretSum":[0.7620832768956922,-496.07475026704253,-496.07475026704253],"strategy":[1,0,0],"strategySum":[495.36739317302255,2.6056743000768416,2.6056743000768416]}]]
const fs = require('fs');
const path = require('path');

const directory = '.results';
const files = fs.readdirSync(directory);
const dataRaw = [];

for (const file of files) {
  if (path.extname(file) === '.json') {
    const data = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
    for (const [key, value] of data) {
      dataRaw.push(value)
    }
  }
}

// const data = dataRaw.flat().filter(r => r["infoSet"])
const dataLisible = dataRaw.map(r => {
  const infoSet = r["infoSet"];
  const strategy = r["strategy"];
  return { infoSet, strategy };
});
// console.log(dataLisible);
console.dir(dataRaw.filter(r => r["infoSet"].startsWith('2x-2x-2x-6x-9x')), { maxArrayLength: null });
// console.dir(dataLisible.filter(r => r["strategy"][1] >= 0.5 && r["infoSet"].endsWith('bbbb')).reverse());
// console.dir(dataLisible.filter(r => r["infoSet"].startsWith('2x-2x-2x') && r["infoSet"].includes('6x')), { maxArrayLength: null });

// const result = dataLisible.filter(r => r["strategy"][1] >= 0.5 && r["infoSet"].endsWith('bbbb')).reverse()
// const pathReader = process.cwd() + '/.results_reader/result.json'
// fs.writeFileSync(pathReader, JSON.stringify(result));
