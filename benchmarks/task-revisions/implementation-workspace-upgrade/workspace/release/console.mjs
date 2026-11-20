import { administer } from './printer.mjs';
console.log(JSON.stringify(administer(process.argv[2],JSON.parse(process.argv[3]))));
