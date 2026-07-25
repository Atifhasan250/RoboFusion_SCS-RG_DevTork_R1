import { readFile } from "fs/promises";
import path from "path";
export interface RiskFeatures { gas:number; water:number; fire:number; occupancy:number; slope:number; }
type Model={version:string;intercept:number;coefficients:Record<keyof RiskFeatures,number>};let model:Model|undefined;
async function load(){if(!model)model=JSON.parse(await readFile(path.join(process.cwd(),process.env.ML_MODEL_PATH??"models/risk-model-v1.json"),"utf8")) as Model;return model}
export async function predictRisk(input:RiskFeatures){const m=await load(),logit=m.intercept+Object.entries(m.coefficients).reduce((s,[k,w])=>s+input[k as keyof RiskFeatures]*w,0);return{probability:Math.round((1/(1+Math.exp(-logit)))*10000)/10000,modelVersion:m.version,advisoryOnly:true}}
