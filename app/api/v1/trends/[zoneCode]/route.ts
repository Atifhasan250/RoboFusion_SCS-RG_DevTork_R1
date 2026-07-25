import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/src/server/auth/session";
import { collections } from "@/src/server/db/collections";
import { riskTrend } from "@/src/server/services/trend-service";
export async function GET(_:Request,ctx:{params:Promise<{zoneCode:string}>}){try{await requireUser();const{zoneCode}=await ctx.params,zone=await(await collections()).zones.findOne({code:zoneCode});if(!zone)return NextResponse.json({error:"NOT_FOUND"},{status:404});return NextResponse.json({trend:await riskTrend(zone.id),advisory:"Trend does not alter live risk or issue physical commands."})}catch(e){return NextResponse.json({error:e instanceof AuthError?e.code:"ERROR"},{status:e instanceof AuthError?e.status:500})}}
