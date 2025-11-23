// validate-resources.js
const fs = require('fs');
const path = 'dtes-resources.json';
if(!fs.existsSync(path)){ console.error('dtes-resources.json missing'); process.exit(2); }
const arr = JSON.parse(fs.readFileSync(path,'utf8'));
const problems = [];
arr.forEach((r,i) => {
  if(!r.name) problems.push(`${i}: missing name`);
  if(!r.type) problems.push(`${i}: missing type`);
  const latHas = ('lat' in r) && (r.lat !== null);
  const lngHas = ('lng' in r) && (r.lng !== null);
  if(latHas !== lngHas) problems.push(`${i}: lat/lng mismatch`);
});
if(problems.length){ console.error('Problems:',problems); process.exit(2); }
console.log('Validation OK —',arr.length,'resources');
process.exit(0);
