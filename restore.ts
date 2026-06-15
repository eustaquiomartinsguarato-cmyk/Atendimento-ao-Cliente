import * as fs from 'fs';
try {
  console.log("Readdir /tmp:", fs.readdirSync('/tmp'));
} catch (e: any) {
  console.log("Error /tmp:", e.message);
}
