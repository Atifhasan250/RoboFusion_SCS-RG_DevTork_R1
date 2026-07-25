const fs = require("fs");
const pdf = require("pdf-parse");
pdf(fs.readFileSync("RoboFusion_1.0_SCS-RG_Round1_Case.pdf")).then(d => {
  console.log(d.text);
}).catch(e => console.error(e));
