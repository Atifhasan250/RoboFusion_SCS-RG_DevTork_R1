import "dotenv/config";
import { collections } from "../src/server/db/collections";
import { env } from "../src/server/config/env";
import { hashSecret, id } from "../src/server/utils/id";
async function main(){const c=await collections(),now=new Date();for(let i=1;i<=30;i++){const code=`PHANTOM_${i}`;await c.zones.updateOne({code},{$setOnInsert:{id:id(),code,name:`Load Test Zone ${i}`,configured:true,apiKeyHash:hashSecret(`${code}-demo-key`,env.ZONE_API_KEY_PEPPER),state:"SAFE",riskScore:0,primaryHazard:null,occupancy:false,commandVersion:0,createdAt:now,updatedAt:now}},{upsert:true})}console.log("Provisioned 30 protected phantom zones.")};main().catch(e=>{console.error(e);process.exit(1)});
