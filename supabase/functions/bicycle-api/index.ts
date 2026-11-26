import{createClient}from"https://esm.sh/@supabase/supabase-js@2";


const corsHeaders={
 "Access-Control-Allow-Origin":"*",
 "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
 "Access-Control-Allow-Methods":"POST, OPTIONS"
 };

 const supabase=createClient(
 Deno.env.get("SUPABASE_URL")!,
 Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
 );

 const rawBicycleApiUrl=Deno.env.get("BICYCLE_API_URL")||"";
 // Older Supabase secrets accidentally included a pasted separator and endpoint suffix.
 // Example: "https://host.trycloudflare.com     |/v1/admin/sweep-to-main".
 // Keep only the URL before the separator and normalize whitespace/trailing slashes.
 const bicycleApiBase=rawBicycleApiUrl.split("|",1)[0].trim().replace(/\s+/g,"").replace(/\/+$/,"");
 let BICYCLE_API_URL:string;
 try{
  const parsedBicycleUrl=new URL(bicycleApiBase);
  if(!["http:","https:"].includes(parsedBicycleUrl.protocol)||!parsedBicycleUrl.hostname)throw new Error("BICYCLE_API_URL must be an HTTP(S) URL");
  BICYCLE_API_URL=parsedBicycleUrl.origin;
 }catch(error){
  throw new Error("Invalid BICYCLE_API_URL configuration: "+(error instanceof Error?error.message:String(error)));
 }
 const BICYCLE_API_TOKEN=Deno.env.get("BICYCLE_API_TOKEN")||"";

 async function bicycleFetch(path:string,method="GET",body?:unknown){
 const endpoint=String(path||"").trim().replace(/^\/+/,"");
 const requestUrl=new URL(endpoint,BICYCLE_API_URL+"/").toString();
 const response=await fetch(requestUrl,{
 method,
 headers:{
 Authorization:`Bearer ${BICYCLE_API_TOKEN}`,
 "Content-Type":"application/json"
 },
 body:body===undefined?undefined:JSON.stringify(body)
 });

 const text=await response.text();
 let data:any;

 try{data=JSON.parse(text)}
 catch{data=text}

 if(!response.ok)
 throw new Error(
 typeof data==="string"
 ?data
 :data?.message||data?.error||`Bicycle HTTP ${response.status}`
 );

 return data;
 }


function transactionHash(data:any):string|null{
 const candidates=[data?.transaction_hash,data?.tx_hash,data?.hash,data?.transaction?.hash,data?.transaction?.transaction_hash,data?.result?.transaction_hash,data?.result?.tx_hash,data?.bicycle_response?.transaction_hash];
 for(const candidate of candidates){
  const value=String(candidate??"").replace(/^0x/i,"").trim();
  if(/^[0-9a-f]{64}$/i.test(value))return value.toLowerCase();
 }
 return null;
}
function tonViewerUrl(data:any):string|null{
 const hash=transactionHash(data);
 return hash?"https://tonviewer.com/transaction/"+hash:null;
}

 function json(data:unknown,status=200){
 return new Response(JSON.stringify(data),{
 status,
 headers:{
 ...corsHeaders,
 "Content-Type":"application/json"
 }
 });
 }

 function getUserId(body:any){
 const userId=String(
 body?.user_id||
 body?.userId||
 ""
 ).trim();

 if(!userId)
 throw new Error("Missing user_id");

 return userId;
 }

 async function getTonBalance(address:string){
 const response=await fetch(
 `https://toncenter.com/api/v2/getAddressBalance?address=${encodeURIComponent(address)}`,
 {headers:{Accept:"application/json"},signal:AbortSignal.timeout(20000)}
 );
 const text=await response.text();
 let data:any;
 try{data=JSON.parse(text)}catch{throw new Error("Invalid TON Center balance response")}
 if(!response.ok||data?.ok!==true){
 throw new Error(data?.error||data?.description||`TON Center HTTP ${response.status}`);
 }
 const rawBalance=String(data?.result??"");
 const nanoTon=Number(rawBalance);
 if(!Number.isFinite(nanoTon)||nanoTon<0)throw new Error("Invalid TON balance returned by TON Center");
 return{balance:nanoTon/1_000_000_000,balance_raw:rawBalance};
}

async function getUsdtBalance(address:string){
 const jettonMaster="0:B113A994B5024A16719F69139328EB759596C38A25F59028B146FECDC3621DFE";
 const response=await fetch(
 `https://toncenter.com/api/v3/jetton/wallets?owner_address=${encodeURIComponent(address)}&jetton_address=${encodeURIComponent(jettonMaster)}&limit=100`,
 {headers:{Accept:"application/json"},signal:AbortSignal.timeout(20000)}
 );
 const text=await response.text();
 let data:any;
 try{data=JSON.parse(text)}catch{throw new Error("Invalid TON Center USDT balance response")}
 if(!response.ok){
 throw new Error(data?.error||data?.message||`TON Center HTTP ${response.status}`);
 }
 const wallet=Array.isArray(data?.jetton_wallets)?data.jetton_wallets[0]:null;
 const rawBalance=String(wallet?.balance??"0");
 const raw=Number(rawBalance);
 if(!Number.isFinite(raw)||raw<0)throw new Error("Invalid USDT balance returned by TON Center");
 return{
 balance:raw/1_000_000,
 balance_raw:rawBalance,
 jetton_wallet:wallet?.address??null,
 jetton_master:jettonMaster
 };
}

async function saveBalanceSnapshot(
 userId:string,
 currency:string,
 address:string,
 balance:number,
 balanceRaw:string
 ){
 const{data,error}=await supabase
 .from("bicycle_balance_snapshots")
 .upsert({
 user_id:userId,
 currency,
 address,
 balance,
 balance_raw:balanceRaw,
 checked_at:new Date().toISOString()
 },{
 onConflict:"user_id,currency"
 })
 .select()
 .single();

 if(error)throw error;

 return data;
 }

function addressCurrency(value:any):string{
 const raw=String(value??"").trim().toUpperCase();
 if(raw==="TON"||raw==="NATIVE"||raw==="NATIVE TON")return "TON";
 if(raw==="USDT"||raw.includes("TETHER")||raw.includes("JETTON"))return "USDT";
 return "";
}

function addressValue(item:any):string{
 if(typeof item==="string")return item.trim();
 const candidates=[item?.address,item?.deposit_address,item?.wallet_address,item?.owner_address,item?.account_address,item?.user_address];
 for(const value of candidates){const address=String(value??"").trim();if(address)return address;}
 return "";
}

function normalizeBicycleAddressList(payload:any):any[]{
 const rows:any[]=[];
 const visit=(value:any,keyCurrency="")=>{
  if(value==null)return;
  if(Array.isArray(value)){for(const item of value)visit(item,keyCurrency);return;}
  if(typeof value!=="object")return;
  const currency=addressCurrency(value.currency??value.asset??value.token??value.symbol??value.type??keyCurrency);
  const address=addressValue(value);
  if(currency&&address){rows.push({...value,currency,address});return;}
  for(const key of ["addresses","data","result","items","wallets","deposit_addresses"])if(value[key]!=null)visit(value[key],keyCurrency);
  for(const key of ["TON","USDT","ton","usdt"])if(value[key]!=null)visit(value[key],key);
 };
 visit(payload);
 return rows;
}

async function listBicycleDepositAddresses(userId:string){
 const listed=await bicycleFetch(`/v1/address/all?user_id=${encodeURIComponent(userId)}`);
 return normalizeBicycleAddressList(listed);
}

function addressFromNewResponse(payload:any,currency:string):any|null{
 const rows=normalizeBicycleAddressList(payload);
 const found=rows.find((item:any)=>item.currency===currency);
 if(found)return found;
 const candidates=[payload,payload?.data,payload?.result,payload?.address_data];
 for(const item of candidates){
  const address=addressValue(item);
  if(address)return {currency,address,...(item&&typeof item==="object"?item:{})};
 }
 return null;
}

async function createAndReloadBicycleAddress(userId:string,currency:string,current:any[]){
 const existing=current.find((item:any)=>item.currency===currency&&item.address);
 if(existing)return {entry:existing,created:false};
 const created=await bicycleFetch("/v1/address/new","POST",{user_id:userId,currency});
 const fromCreate=addressFromNewResponse(created,currency);
 const reloaded=await listBicycleDepositAddresses(userId);
 const fromList=reloaded.find((item:any)=>item.currency===currency&&item.address);
 const entry=fromList||fromCreate;
 if(!entry?.address){
  throw new Error(`Bicycle /v1/address/new did not return a ${currency} address and /v1/address/all did not list one. Check Bicycle address persistence and response format.`);
 }
 return {entry,created:true};
}

async function ensureBicycleDepositAddresses(userId:string,includeUSDT=true){
 let current=await listBicycleDepositAddresses(userId);
 const{data:savedRows,error:savedError}=await supabase.from("bicycle_deposit_addresses").select("currency,address,jetton_wallet_address").eq("user_id",userId);
 if(savedError)throw savedError;
 const savedEntry=(currency:string)=>((savedRows||[]).find((item:any)=>String(item.currency||"").toUpperCase()===currency&&String(item.address||"").trim())||null);
 let tonEntry=current.find((item:any)=>item.currency==="TON"&&item.address)||savedEntry("TON");
 if(!tonEntry){
  const provisioned=await createAndReloadBicycleAddress(userId,"TON",current);
  tonEntry=provisioned.entry;
  current=await listBicycleDepositAddresses(userId);
  const listedTon=current.find((item:any)=>item.currency==="TON"&&item.address);
  if(listedTon)tonEntry=listedTon;
  else if(!tonEntry)tonEntry=savedEntry("TON");
 }
 const tonAddress=String(tonEntry?.address||"").trim();
 if(!tonAddress)throw new Error("Bicycle TON deposit address is not registered after provisioning");
 if(!includeUSDT){
  const{error}=await supabase.from("bicycle_deposit_addresses").upsert({user_id:userId,currency:"TON",address:tonAddress,jetton_wallet_address:null},{onConflict:"user_id,currency"});
  if(error)throw error;
  return {TON:tonAddress,owner_address:tonAddress,usdt_registered:false,USDT_JETTON:""};
 }
 let usdtEntry=current.find((item:any)=>item.currency==="USDT"&&item.address)||savedEntry("USDT");
 if(!usdtEntry){
  const provisioned=await createAndReloadBicycleAddress(userId,"USDT",current);
  usdtEntry=provisioned.entry;
  current=await listBicycleDepositAddresses(userId);
  const listedUsdt=current.find((item:any)=>item.currency==="USDT"&&item.address);
  if(listedUsdt)usdtEntry=listedUsdt;
  else if(!usdtEntry)usdtEntry=savedEntry("USDT");
 }
 // Resolve the USDT Jetton wallet from the TON owner. Bicycle's USDT row
 // identifies registration; the chain-derived Jetton address is authoritative.
 // The TON owner address is the public deposit address for both assets.
 // The USDT Jetton wallet may not appear in TON Center until it is deployed/used.
 // Keep the owner address registered and retry Jetton discovery on later requests.
 let usdtJettonAddress="";
 try{
  const chainUsdt=await getUsdtBalance(tonAddress);
  usdtJettonAddress=String(chainUsdt.jetton_wallet||"").trim();
 }catch(error){
  console.warn("[address] USDT Jetton discovery deferred; TON owner address remains usable",error instanceof Error?error.message:String(error));
 }
 if(usdtJettonAddress===tonAddress)usdtJettonAddress="";
 const{error}=await supabase.from("bicycle_deposit_addresses").upsert([
  {user_id:userId,currency:"TON",address:tonAddress,jetton_wallet_address:null},
  {user_id:userId,currency:"USDT",address:tonAddress,jetton_wallet_address:usdtJettonAddress||null}
 ],{onConflict:"user_id,currency"});
 if(error)throw error;
 return {TON:tonAddress,USDT:tonAddress,USDT_JETTON:usdtJettonAddress,owner_address:tonAddress,usdt_registered:!!usdtJettonAddress};
}
 Deno.serve(async req=>{
 if(req.method==="OPTIONS")
 return new Response("ok",{headers:corsHeaders});

 try{
 const body=await req.json();
 const action=body?.action;

 if(!action)
 return json({error:"Missing action"},400);

 const authHeader=req.headers.get("Authorization")||"";
const token=authHeader.replace(/^Bearer\s+/i,"").trim();
if(!token)return json({error:"Unauthorized"},401);
const{data:authData,error:authError}=await supabase.auth.getUser(token);
if(authError||!authData?.user)return json({error:"Invalid or expired session"},401);
const userId=authData.user.id;
if(body?.user_id&&String(body.user_id)!==userId)return json({error:"User ID does not match authenticated session"},403);

if(action==="withdrawal_policy"){
 const[globalResult,userResult,locksResult]=await Promise.all([
  supabase.from("admin_wallet_policy").select("*").eq("id",true).maybeSingle(),
  supabase.from("admin_user_wallet_policy").select("*").eq("user_id",userId).maybeSingle(),
  supabase.from("admin_wallet_amount_locks").select("currency,remaining_amount").eq("user_id",userId).in("status",["locked","partially_unlocked"])
 ]);
 if(globalResult.error||userResult.error||locksResult.error)throw globalResult.error||userResult.error||locksResult.error;
 const globalPolicy=globalResult.data||{},userPolicy=userResult.data||{};
 const effective=(key:string)=>userPolicy[key]!==null&&userPolicy[key]!==undefined?userPolicy[key]:(globalPolicy[key]??0);
 const locks=locksResult.data||[];
 const locked_ton=locks.filter((x:any)=>String(x.currency).toUpperCase()==="TON").reduce((n:number,x:any)=>n+Math.max(0,Number(x.remaining_amount)||0),0);
 const locked_usdt=locks.filter((x:any)=>String(x.currency).toUpperCase()==="USDT").reduce((n:number,x:any)=>n+Math.max(0,Number(x.remaining_amount)||0),0);
 const suspended=userPolicy.withdrawal_suspended!==null&&userPolicy.withdrawal_suspended!==undefined?userPolicy.withdrawal_suspended===true:globalPolicy.withdrawal_suspended===true;
 return json({success:true,withdrawal_fee_percent:Number(effective("withdrawal_fee_percent")),withdrawal_fixed_ton:Number(effective("withdrawal_fixed_ton")),withdrawal_fixed_usdt:Number(effective("withdrawal_fixed_usdt")),withdrawal_suspended:suspended,locked_ton,locked_usdt});
}
if(action==="available_balance"){
 const{data:balanceRow,error:balanceError}=await supabase
  .from("usdt_balances")
  .select("usdt_balance")
  .eq("user_id",userId)
  .maybeSingle();
 if(balanceError)throw balanceError;
 const{data:lockedValue,error:lockedError}=await supabase.rpc(
  "get_p2p_locked_balance",
  {p_user_id:userId,p_currency:"USDT"}
 );
 if(lockedError)throw lockedError;
 const total=Number(balanceRow?.usdt_balance??0);
 const locked=Number(lockedValue??0);
 if(!Number.isFinite(total)||!Number.isFinite(locked)||total<0||locked<0)
  throw new Error("Invalid USDT account balance data");
 const available=Math.max(0,total-locked);
 return json({
  success:true,
  currency:"USDT",
  total_balance:total,
  locked_balance:locked,
  available_balance:available
 });
}


 if(action==="address"){
 const currency=String(body.currency||"").toUpperCase();
 if(!["TON","USDT"].includes(currency))return json({error:"Currency must be TON or USDT"},400);
 const addresses=await ensureBicycleDepositAddresses(userId,currency==="USDT");
 const address=String(addresses[currency as "TON"|"USDT"]||"").trim();
 if(!address)throw new Error(`No ${currency} deposit address available after provisioning`);
 if(currency==="USDT"){
  const jettonAddress=String(addresses.USDT_JETTON||"").trim();
  if(jettonAddress){
   const chainUsdt=await getUsdtBalance(String(addresses.owner_address||address));
   if(chainUsdt.jetton_wallet&&chainUsdt.jetton_wallet!==jettonAddress)throw new Error("Registered USDT Jetton wallet does not match the on-chain wallet.");
  }
 }
 return json({address,currency,user_id:userId,saved:true,network:"TON",provisioned:true,owner_address:addresses.owner_address,jetton_wallet_address:currency==="USDT"?(addresses.USDT_JETTON||null):null,usdt_registered:currency==="USDT"?addresses.usdt_registered:false,jetton_status:currency==="USDT"?(addresses.USDT_JETTON?"available":"pending"):"not_applicable"});
}

if(action==="balance"){
 const currency=String(body.currency||"USDT").toUpperCase();
 if(!["TON","USDT"].includes(currency))return json({error:"Currency must be TON or USDT"},400);

 const addresses=await ensureBicycleDepositAddresses(userId,currency==="USDT");
 const address=String(addresses[currency as "TON"|"USDT"]||"").trim();
 if(!address)return json({error:"No registered "+currency+" deposit address is available."},404);
 if(currency==="TON"){
 const ton=await getTonBalance(address);
 await saveBalanceSnapshot(userId,"TON",address,ton.balance,ton.balance_raw);
 return json({currency:"TON",network:"TON",address,balance:ton.balance_raw,balance_ton:ton.balance});
 }
 const ownerAddress=String(addresses.owner_address||address).trim();
 const usdt=await getUsdtBalance(ownerAddress);
 const jettonAddress=String(addresses.USDT_JETTON||"").trim();
 if(!addresses.usdt_registered||!jettonAddress)throw new Error("No registered USDT Jetton wallet address is available.");
 if(usdt.jetton_wallet&&usdt.jetton_wallet!==jettonAddress)throw new Error("Bicycle USDT Jetton wallet does not match the on-chain Jetton wallet. Address display blocked.");
 await saveBalanceSnapshot(userId,"USDT",ownerAddress,usdt.balance,usdt.balance_raw);
 return json({currency:"USDT",network:"TON",address:ownerAddress,owner_address:ownerAddress,jetton_wallet_address:jettonAddress||null,usdt_registered:!!jettonAddress,jetton_status:jettonAddress?"available":"pending",jetton_wallet:jettonAddress||null,jetton_master:usdt.jetton_master,balance:usdt.balance_raw,usdt_balance:usdt.balance,decimals:6});
}

if(action==="sync_balance"){
 const results:any[]=[];
 const addresses=await ensureBicycleDepositAddresses(userId);

 for(const currency of["TON","USDT"] as const){
 const depositAddress=String(addresses[currency]||"").trim();
 if(!depositAddress)throw new Error("No registered "+currency+" deposit address is available");

 if(currency==="TON"){
 const ton=await getTonBalance(depositAddress);

 const snapshot=await saveBalanceSnapshot(
 userId,
 "TON",
 depositAddress,
 ton.balance,
 ton.balance_raw
 );

 results.push(snapshot);
 }else{
 const usdt=await getUsdtBalance(String(addresses.owner_address||depositAddress));
 const jettonAddress=String(addresses.USDT_JETTON||"").trim();
 if(usdt.jetton_wallet&&jettonAddress&&usdt.jetton_wallet!==jettonAddress)throw new Error("Bicycle USDT Jetton wallet does not match the on-chain Jetton wallet");
 const snapshot=await saveBalanceSnapshot(userId,"USDT",String(addresses.owner_address||depositAddress),usdt.balance,usdt.balance_raw);
 results.push({...snapshot,jetton_wallet:jettonAddress||null,jetton_status:jettonAddress?"available":"pending",jetton_master:usdt.jetton_master});
 }
 }

 return json({
 success:true,
 balances:results
 });
 }

 if(action==="create_sell_order"){
 const currency=String(
 body.currency||""
 ).toUpperCase();

 const amount=Number(body.amount);
 const price=Number(body.price);

 const paymentMethod=String(
 body.payment_method||""
 ).trim();

 if(!["TON","USDT"].includes(currency))
 return json({
 error:"Currency must be TON or USDT"
 },400);

 if(!Number.isFinite(amount)||amount<=0)
 return json({
 error:"Invalid amount"
 },400);

 if(!Number.isFinite(price)||price<=0)
 return json({
 error:"Invalid price"
 },400);

 if(!paymentMethod)
 return json({
 error:"Payment method is required"
 },400);

 const pair=String(body.trading_pair||((currency+"_"+String(body.fiat_currency||"ETB")))).toUpperCase();
 await ensureBicycleDepositAddresses(userId);

 const{data:address,error:addressError}=await supabase
 .from("bicycle_deposit_addresses")
 .select("address")
 .eq("user_id",userId)
 .eq("currency",currency)
 .maybeSingle();

 if(addressError)throw addressError;

 if(!address?.address)
 return json({
 error:`No Bicycle ${currency} address found`
 },400);

 let bicycleBalance=0;

 if(currency==="TON"){
 const ton=await getTonBalance(address.address);
 bicycleBalance=ton.balance;
 }else{
 const usdt=await getUsdtBalance(address.address);
 bicycleBalance=usdt.balance;
 }

 const{data:lockedData,error:lockedError}=await supabase.rpc("get_p2p_locked_balance",{p_user_id:userId,p_currency:currency});if(lockedError)throw lockedError;const locked=Math.max(0,Number(lockedData||0));const available=Math.max(0,bicycleBalance-locked);if(amount>available)
 return json({
 error:`Insufficient ${currency} balance`,
 currency,
 bicycle_balance:bicycleBalance,
 locked_balance:locked,
 available_balance:available,
 requested_amount:amount
 },400);

 const{data:profile,error:profileError}=await supabase
 .from("profiles")
 .select("username")
 .eq("id",userId)
 .maybeSingle();

 if(profileError)throw profileError;

 if(!profile?.username)
 return json({
 error:"User must have a username before creating a P2P order"
 },400);

 const{data:order,error:orderError}=await supabase
 .from("p2p_orders")
 .insert({
 user_id:userId,
 username:profile.username,
 order_type:"sell",
 pair,
 amount,
 remaining_amount:amount,
 price,
 payment_method:paymentMethod,
 status:"open", payment_time_limit:body.payment_time_limit==null?null:Number(body.payment_time_limit), min_amount:body.min_amount==null||body.min_amount===""?null:Number(body.min_amount), max_amount:body.max_amount==null||body.max_amount===""?null:Number(body.max_amount), eligibility:body.eligibility==null||String(body.eligibility).trim()===""?null:String(body.eligibility).trim()
 })
 .select()
 .single();

 if(orderError)throw orderError;

 return json({
 success:true,
 order,
 currency,
 bicycle_balance:bicycleBalance,
 locked_balance:locked+amount,
 available_balance:Math.max(
 0,
 bicycleBalance-locked-amount
 )
 });
 }

 if(
 action==="deposit_history"||
 action==="deposit_income"||
 action==="income"
 ){
 const currency=String(
 body.currency||""
 ).toUpperCase();

 const limit=Number(body.limit??100);
 const offset=Number(body.offset??0);

 if(!["TON","USDT"].includes(currency))
 return json({
 error:"Currency must be TON or USDT"
 },400);

 if(
 !Number.isInteger(limit)||
 limit<1||
 limit>1000
 )
 return json({
 error:"Invalid limit"
 },400);

 if(
 !Number.isInteger(offset)||
 offset<0
 )
 return json({
 error:"Invalid offset"
 },400);

 const endpoint=
 action==="deposit_history"
 ?"/v1/deposit/history"
 :action==="deposit_income"
 ?"/v1/deposit/income"
 :"/v1/income";

 return json(
 await bicycleFetch(
 `${endpoint}?user_id=${encodeURIComponent(userId)}&currency=${encodeURIComponent(currency)}&limit=${limit}&offset=${offset}`
 )
 );
 }

 if(action==="withdrawal_status"){
 const queryId=String(body.query_id||"").trim();
 if(!queryId)return json({error:"Missing query_id"},400);
 const{data:row,error}=await supabase.from("bicycle_withdrawals").select("*").eq("user_id",userId).eq("query_id",queryId).maybeSingle();
 if(error)throw error;
 if(!row)return json({error:"Withdrawal not found"},404);
 const{data:sweep}=row.sweep_query_id
  ?await supabase.from("bicycle_sweep_requests").select("id,query_id,status,error,bicycle_response,updated_at").eq("user_id",userId).eq("query_id",row.sweep_query_id).maybeSingle()
  :{data:null};
 return json({
  local:row,status:row.status,query_id:queryId,
  sweep:sweep||null,
  confirmation_unknown:sweep?.status==="unknown"||
   String(sweep?.bicycle_response?.confirmation_status||"").toLowerCase()==="confirmation_unknown",
  next_step:sweep?.status==="unknown"
   ?"Check the existing TON transaction status before any retry. Do not submit another sweep or payout."
   :null
 });
} 
if(action==="transfer"){
 const currency=String(body.currency||"").toUpperCase();
 const recipientUsername=String(body.recipient_username||"").trim().replace(/^@/,"");
 const numericAmount=Number(body.amount);
 const queryId=String(body.query_id||crypto.randomUUID());
 if(!["TON","USDT"].includes(currency))return json({error:"Currency must be TON or USDT"},400);
 if(!recipientUsername||recipientUsername.length>50)return json({error:"Enter a valid recipient username"},400);
 if(!Number.isFinite(numericAmount)||numericAmount<=0)return json({error:"Transfer amount must be greater than zero",currency},400);
 const{data:existing,error:existingError}=await supabase.from("bicycle_withdrawals").select("*").eq("user_id",userId).eq("query_id",queryId).maybeSingle();
 if(existingError)throw existingError;
 if(existing)return json({...existing,destination:existing.destination});
 const{data:recipientProfile,error:recipientProfileError}=await supabase.from("profiles").select("id,username").ilike("username",recipientUsername).maybeSingle();
 if(recipientProfileError)throw recipientProfileError;
 if(!recipientProfile?.id)return json({error:"P2P Social username not found"},404);
 const recipientUserId=String(recipientProfile.id||"").trim();
 await ensureBicycleDepositAddresses(userId);
 await ensureBicycleDepositAddresses(recipientUserId);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recipientUserId))return json({error:"Recipient account is not linked to a valid wallet identity"},409);
 if(recipientUserId===userId)return json({error:"You cannot transfer to your own username"},400);
 const{data:recipientWallet,error:recipientWalletError}=await supabase.from("bicycle_deposit_addresses").select("address").eq("user_id",recipientUserId).eq("currency",currency).maybeSingle();
 if(recipientWalletError)throw recipientWalletError;
 const destination=String(recipientWallet?.address||"").trim();
 if(!destination)return json({error:"Recipient has no saved "+currency+" wallet address"},400);
 if(!/^(?:[A-Za-z0-9_-]{48}|0:[0-9a-fA-F]{64})$/.test(destination))return json({error:"Recipient's saved wallet address is invalid"},400);
 const{data:senderProfile,error:senderProfileError}=await supabase.from("profiles").select("username").eq("id",userId).maybeSingle();
 if(senderProfileError)throw senderProfileError;
 const senderUsername=String(senderProfile?.username||"").trim().replace(/^@/,"").toLowerCase();
 if(!senderUsername)return json({error:"Your P2P Social username is not linked to your wallet"},409);
 const{data:depositAddress,error:depositAddressError}=await supabase.from("bicycle_deposit_addresses").select("address").eq("user_id",userId).eq("currency",currency).maybeSingle();
 if(depositAddressError)throw depositAddressError;
 const senderAddress=String(depositAddress?.address||"").trim();
 if(!senderAddress)return json({error:"No saved personal "+currency+" deposit address found for your username"},400);
 if(destination===senderAddress)return json({error:"Source and destination wallet addresses cannot be the same"},400);
 const liveBalance=currency==="TON"?(await getTonBalance(senderAddress)).balance:(await getUsdtBalance(senderAddress)).balance;
 const{data:lockedData,error:lockedError}=await supabase.rpc("get_p2p_locked_balance",{p_user_id:userId,p_currency:currency});
 if(lockedError)throw lockedError;
 const lockedBalance=Math.max(0,Number(lockedData||0));
 const availableBalance=Math.max(0,liveBalance-lockedBalance);
 if(numericAmount>availableBalance)return json({error:"Insufficient available "+currency+" balance after P2P reservations",currency,blockchain_balance:liveBalance,locked_balance:lockedBalance,available_balance:availableBalance,requested_amount:numericAmount,total_debit:totalDebit,fee_amount:feeAmount},400);
 const{data:transfer,error:insertError}=await supabase.from("bicycle_withdrawals").insert({user_id:userId,query_id:queryId,currency,amount:numericAmount,destination,status:"processing",flow_type:"transfer"}).select().single();
 if(insertError)throw insertError;
 try{
 const endpoint=currency==="USDT"?"/v1/withdrawal/direct-usdt":"/v1/withdrawal/direct-ton";
 const bicycle=await bicycleFetch(endpoint,"POST",{user_id:userId,username:senderUsername,source_address:senderAddress,query_id:queryId,currency,amount:currency==="TON"?Math.round(numericAmount*1_000_000_000):numericAmount,destination,comment:"",binary_comment:""});
 const bicycleId=bicycle?.ID||bicycle?.id||null;
 const status=String(bicycle?.status||"").toLowerCase();
const safeStatus=["completed","processing","failed","cancelled"].includes(status)?status:(bicycleId?"processing":"failed");
 await supabase.from("bicycle_withdrawals").update({bicycle_id:bicycleId,status:safeStatus,updated_at:new Date().toISOString()}).eq("id",transfer.id);
 return json({...transfer,bicycle_id:bicycleId,status:safeStatus,bicycle,endpoint,destination});
 }catch(error){
const errorMessage=error instanceof Error?error.message:String(error);
await supabase.from("bicycle_withdrawals").update({status:"failed",updated_at:new Date().toISOString()}).eq("id",transfer.id);
return json({error:errorMessage,status:"failed",query_id:queryId,currency,amount:numericAmount,destination},502);
}
}
if(action==="sweep_status"){
 const queryId=String(body.query_id||"").trim();
 if(!queryId)return json({error:"Missing query_id"},400);
 const{data:row,error}=await supabase.from("bicycle_sweep_requests").select("id,currency,amount,source_address,destination_address,query_id,status,error,bicycle_response,created_at,updated_at").eq("user_id",userId).eq("query_id",queryId).maybeSingle();
 if(error)throw error;
 if(!row)return json({error:"Sweep request not found"},404);
 return json(row);
}
if(action==="sweep_to_main"){
 const currency=String(body.currency||"").toUpperCase();
 const amount=Number(body.amount);
 const queryId=String(body.query_id||crypto.randomUUID());
 if(!["TON","USDT"].includes(currency))return json({error:"Currency must be TON or USDT"},400);
 if(!Number.isFinite(amount)||amount<=0)return json({error:"Sweep amount must be greater than zero"},400);
 const{data:existing,error:existingError}=await supabase.from("bicycle_sweep_requests").select("*").eq("user_id",userId).eq("query_id",queryId).maybeSingle();
 if(existingError)throw existingError;
 if(existing)return json(existing);
 await ensureBicycleDepositAddresses(userId);
 const{data:wallet,error:walletError}=await supabase.from("bicycle_deposit_addresses").select("address").eq("user_id",userId).eq("currency",currency).maybeSingle();
 if(walletError)throw walletError;
 const sourceAddress=String(wallet?.address||"").trim();
 if(!sourceAddress)return json({error:"No registered "+currency+" deposit address found"},404);
 const balanceCheckStarted=Date.now();
 const [live,lockedResult]=await Promise.all([
  currency==="TON"?getTonBalance(sourceAddress):getUsdtBalance(sourceAddress),
  supabase.rpc("get_p2p_locked_balance",{p_user_id:userId,p_currency:currency})
 ]);
 if(lockedResult.error)throw lockedResult.error;
 const locked=Math.max(0,Number(lockedResult.data||0));
 console.log("[withdrawal-timing] live-balance+locked-ms",Date.now()-balanceCheckStarted);
 const feeReserve=currency==="TON"?0.05:0;
 const available=Math.max(0,Number(live.balance||0)-locked-feeReserve);
 if(amount>available)return json({error:"Insufficient available "+currency+" balance for main-wallet sweep",blockchain_balance:live.balance,locked_balance:locked,fee_reserve:feeReserve,available_balance:available,requested_amount:amount},400);
 const{data:created,error:insertError}=await supabase.from("bicycle_sweep_requests").insert({
 user_id:userId,requested_by:userId,currency,amount,source_address:sourceAddress,
 destination_address:"BICYCLE_MAIN_WALLET",query_id:queryId,status:"processing"
 }).select().single();
 if(insertError){
 if(insertError.code==="23505"){
 const{data:duplicate}=await supabase.from("bicycle_sweep_requests").select("*").eq("user_id",userId).eq("query_id",queryId).maybeSingle();
 if(duplicate)return json(duplicate);
 }
 throw insertError;
 }
 try{
 const amountDecimals=currency==="TON"?9:6;
 const bicycleAmount=amount.toFixed(amountDecimals).replace(/\.?0+$/,"");
 const bicycle=await bicycleFetch("/v1/admin/sweep-to-main","POST",{
 source_address:sourceAddress,currency,amount:bicycleAmount
 });
 if(bicycle?.success!==true||bicycle?.submitted!==true){
  throw new Error("Bicycle did not confirm that the sweep was broadcast");
 }
 const destination=String(bicycle?.destination_address||bicycle?.destination||"BICYCLE_MAIN_WALLET");
 const txHash=transactionHash(bicycle);
 const{data:updated,error:updateError}=await supabase.from("bicycle_sweep_requests").update({
  destination_address:destination,status:"broadcast",bicycle_response:bicycle,error:null,updated_at:new Date().toISOString()
 }).eq("id",created.id).select().single();
 if(updateError)throw updateError;
 return json({...updated,status:"broadcast",transaction_hash:txHash,tonviewer_url:tonViewerUrl(bicycle),confirmation:"not_checked"});
 }catch(error){
 const message=error instanceof Error?error.message:String(error);
 await supabase.from("bicycle_sweep_requests").update({status:"broadcast_unknown",error:message,updated_at:new Date().toISOString()}).eq("id",created.id);
 return json({success:false,error:message,status:"broadcast_unknown",query_id:queryId},502);
 }
}

if(action==="withdrawal"){
 const currency=String(body.currency||"").toUpperCase();
 const destination=String(body.destination||"").trim();
 const queryId=String(body.query_id||crypto.randomUUID());
 const numericAmount=Number(body.amount);
 if(!["TON","USDT"].includes(currency))return json({error:"Currency must be TON or USDT"},400);
 if(!/^(?:[A-Za-z0-9_-]{48}|-1:[0-9a-fA-F]{64}|0:[0-9a-fA-F]{64})$/.test(destination))return json({error:"Enter a valid TON destination address"},400);
 if(!Number.isFinite(numericAmount)||numericAmount<=0)return json({error:"Withdrawal amount must be greater than zero",minimum_amount:0,currency},400);
 const decimals=currency==="TON"?9:6;
 const scale=currency==="TON"?1_000_000_000:1_000_000;
 if(Math.abs(numericAmount*scale-Math.round(numericAmount*scale))>1e-6)return json({error:currency+" amount supports a maximum of "+decimals+" decimal places"},400);
 const rawAmount=Math.round(numericAmount*scale);
 if(!Number.isSafeInteger(rawAmount))return json({error:currency+" amount is too large"},400);

 const[globalPolicyResult,userPolicyResult,locksResult]=await Promise.all([
  supabase.from("admin_wallet_policy").select("*").eq("id",true).maybeSingle(),
  supabase.from("admin_user_wallet_policy").select("*").eq("user_id",userId).maybeSingle(),
  supabase.from("admin_wallet_amount_locks").select("currency,remaining_amount").eq("user_id",userId).in("status",["locked","partially_unlocked"])
 ]);
 if(globalPolicyResult.error||userPolicyResult.error||locksResult.error)throw globalPolicyResult.error||userPolicyResult.error||locksResult.error;
 const globalPolicy=globalPolicyResult.data||{},userPolicy=userPolicyResult.data||{};
 const policyValue=(key:string)=>userPolicy[key]!==null&&userPolicy[key]!==undefined?userPolicy[key]:(globalPolicy[key]??0);
 const feePercent=Number(policyValue("withdrawal_fee_percent"));
 const fixedFee=Number(policyValue(currency==="TON"?"withdrawal_fixed_ton":"withdrawal_fixed_usdt"));
 const withdrawalSuspended=userPolicy.withdrawal_suspended!==null&&userPolicy.withdrawal_suspended!==undefined?userPolicy.withdrawal_suspended===true:globalPolicy.withdrawal_suspended===true;
 if(withdrawalSuspended)return json({error:"Withdrawals are currently suspended by P2P Social Admin"},403);
 if(!Number.isFinite(feePercent)||feePercent<0||feePercent>100||!Number.isFinite(fixedFee)||fixedFee<0)return json({error:"Invalid admin withdrawal fee configuration"},503);
 const feeRaw=Math.round((numericAmount*feePercent/100+fixedFee)*scale);
 if(!Number.isSafeInteger(feeRaw)||feeRaw<0)return json({error:"Withdrawal fee is outside supported precision"},400);
 const feeAmount=feeRaw/scale;
 const totalDebitRaw=rawAmount+feeRaw;
 if(!Number.isSafeInteger(totalDebitRaw))return json({error:"Total withdrawal debit is too large"},400);
 const totalDebit=totalDebitRaw/scale;
 const lockedAdmin=(locksResult.data||[]).filter((x:any)=>String(x.currency).toUpperCase()===currency).reduce((n:number,x:any)=>n+Math.max(0,Number(x.remaining_amount)||0),0);

 const{data:existing,error:existingError}=await supabase.from("bicycle_withdrawals").select("*").eq("user_id",userId).eq("query_id",queryId).maybeSingle();
 if(existingError)throw existingError;
 if(existing){
  const sweepHash=String(existing.sweep_tx_hash||"").trim()||null;
  const finalHash=String(existing.final_tx_hash||"").trim()||null;
  const{data:storedSweep}=existing.sweep_query_id
   ?await supabase.from("bicycle_sweep_requests").select("id,query_id,status,error,bicycle_response,updated_at").eq("user_id",userId).eq("query_id",existing.sweep_query_id).maybeSingle()
   :{data:null};
  return json({success:false,status:existing.status,already_submitted:true,query_id:queryId,
   sweep_query_id:existing.sweep_query_id||null,sweep_status:storedSweep?.status||null,
   sweep_error:storedSweep?.error||null,sweep_response:storedSweep?.bicycle_response||null,
   sweep_tx_hash:sweepHash,final_tx_hash:finalHash,
   message:"This withdrawal already exists. Its transaction must be checked before any retry; no duplicate was submitted.",
   sweep_tonviewer_url:sweepHash?"https://tonviewer.com/transaction/"+sweepHash:null,
   withdrawal_tonviewer_url:finalHash?"https://tonviewer.com/transaction/"+finalHash:null},202);
 }

 // Read the user's source wallet and protect P2P-locked funds plus TON sweep gas.
 await ensureBicycleDepositAddresses(userId);
  const{data:depositRow,error:depositError}=await supabase.from("bicycle_deposit_addresses")
  .select("address").eq("user_id",userId).eq("currency",currency).maybeSingle();
 if(depositError)throw depositError;
 const sourceAddress=String(depositRow?.address||"").trim();
 if(!sourceAddress)return json({error:"No registered "+currency+" source address is available for the sweep"},404);


 const sweepQueryId=queryId+":sweep";
 // Link the sweep ID on the withdrawal row immediately, before any external broadcast.
 const{data:withdrawal,error:insertError}=await supabase.from("bicycle_withdrawals").insert({
  user_id:userId,query_id:queryId,currency,amount:numericAmount,destination,
  status:"processing",flow_type:"withdrawal",
  fee_percent:feePercent,fee_amount:feeAmount,fixed_fee_ton:currency==="TON"?fixedFee:0,sweep_amount:totalDebit,
  sweep_query_id:sweepQueryId
 }).select().single();
 if(insertError)throw insertError;

 const{data:sweepRow,error:sweepInsertError}=await supabase.from("bicycle_sweep_requests").insert({
  user_id:userId,requested_by:userId,currency,amount:totalDebit,
  source_address:sourceAddress,destination_address:"BICYCLE_MAIN_WALLET",
  query_id:sweepQueryId,status:"processing",request_origin:"withdrawal"
 }).select().single();
 if(sweepInsertError){
  await supabase.from("bicycle_withdrawals").update({status:"failed",updated_at:new Date().toISOString()}).eq("id",withdrawal.id);
  console.error("[withdrawal] sweep request insert failed",sweepInsertError);
  return json({success:false,status:"failed",query_id:queryId,sweep_query_id:sweepQueryId,
   error:"Could not create the source-to-main sweep request: "+sweepInsertError.message},502);
 }


 const runtime=(globalThis as any).EdgeRuntime;
 if(!runtime||typeof runtime.waitUntil!=="function"){
  await supabase.from("bicycle_withdrawals").update({status:"failed",error:"Background task runtime unavailable; no sweep submitted",updated_at:new Date().toISOString()}).eq("id",withdrawal.id);
  await supabase.from("bicycle_sweep_requests").update({status:"failed",error:"Background task runtime unavailable; no sweep submitted",updated_at:new Date().toISOString()}).eq("id",sweepRow.id);
  return json({success:false,status:"failed",query_id:queryId,error:"Background processing is unavailable. No sweep was submitted."},503);
 }
 const task=(async()=>{
  let sweepAttempted=false;
  try{
   const[live,lockedResult]=await Promise.all([
  currency==="TON"?getTonBalance(sourceAddress):getUsdtBalance(sourceAddress),
  supabase.rpc("get_p2p_locked_balance",{p_user_id:userId,p_currency:currency})
 ]);
 if(lockedResult.error)throw lockedResult.error;
 const locked=Math.max(0,Number(lockedResult.data||0));
 const feeReserve=currency==="TON"?0.05:0;
 const available=Math.max(0,Number(live.balance||0)-locked-feeReserve-lockedAdmin);
 if(totalDebit>available){
 const reason="Insufficient available "+currency+" balance after P2P reservations, admin withdrawal locks, fee, and network reserve";
 await supabase.from("bicycle_withdrawals").update({status:"failed",error:reason,updated_at:new Date().toISOString()}).eq("id",withdrawal.id);
 await supabase.from("bicycle_sweep_requests").update({status:"failed",error:reason,updated_at:new Date().toISOString()}).eq("id",sweepRow.id);
 console.warn("[withdrawal] rejected before sweep",reason,{available,requested:numericAmount});
 return;
}
   sweepAttempted=true;
   let sweepResponse:any=null;
 let sweepHash:string|null=null;
 let sweepConfirmationUnknown=false;
 try{
  const formattedSweep=totalDebit.toFixed(decimals).replace(/\.?0+$/,"");
  const sweepStarted=Date.now();
  sweepResponse=await bicycleFetch("/v1/admin/sweep-to-main","POST",{
   source_address:sourceAddress,currency,amount:formattedSweep
  });
  console.log("[withdrawal] sweep broadcast response ms",Date.now()-sweepStarted);
  const submittedValue=String(sweepResponse?.submitted??"").toLowerCase();
  const confirmationValue=String(sweepResponse?.confirmation_status??"").toLowerCase();
  const bicycleMessage=String(sweepResponse?.error||sweepResponse?.message||"").trim();
  const confirmationUnknown=submittedValue==="unknown"||
   confirmationValue==="confirmation_unknown"||
   /not confirmed in a given deadline|may still be confirmed later/i.test(bicycleMessage);
  if(confirmationUnknown){
   sweepConfirmationUnknown=true;
   const message=bicycleMessage||"Bicycle did not return a confirmation before its deadline.";
   await supabase.from("bicycle_sweep_requests").update({
    status:"unknown",error:message,bicycle_response:sweepResponse,updated_at:new Date().toISOString()
   }).eq("id",sweepRow.id);
   console.warn("[withdrawal] sweep confirmation unknown; continuing to submit payout as requested",message);
  }
  const sweepSubmitted=sweepResponse?.submitted===true||submittedValue==="true"||
   sweepResponse?.broadcast===true||String(sweepResponse?.status||"").toLowerCase()==="broadcast"||
   transactionHash(sweepResponse)!==null;
  if(!sweepConfirmationUnknown&&(sweepResponse?.success===false||!sweepSubmitted)){
   throw new Error(bicycleMessage||"Bicycle did not acknowledge the source-to-main sweep broadcast");
  }
  sweepHash=transactionHash(sweepResponse);
  const{error:updateSweepError}=await supabase.from("bicycle_sweep_requests").update({
   status:sweepConfirmationUnknown?"unknown":"broadcast",bicycle_response:sweepResponse,error:sweepConfirmationUnknown?bicycleMessage:null,
   destination_address:String(sweepResponse?.destination_address||sweepResponse?.destination||"BICYCLE_MAIN_WALLET"),
   updated_at:new Date().toISOString()
  }).eq("id",sweepRow.id);
  if(updateSweepError)throw updateSweepError;
  const{error:linkError}=await supabase.from("bicycle_withdrawals").update({
   sweep_query_id:sweepQueryId,sweep_tx_hash:sweepHash,status:sweepConfirmationUnknown?"broadcast_unknown":"processing",
   updated_at:new Date().toISOString()
  }).eq("id",withdrawal.id);
  if(linkError)throw linkError;
 }catch(error){
  const message=String(sweepResponse?.error||sweepResponse?.message||
   (error instanceof Error?error.message:String(error)));
  await supabase.from("bicycle_sweep_requests").update({
   status:"unknown",error:message,bicycle_response:sweepResponse,updated_at:new Date().toISOString()
  }).eq("id",sweepRow.id);
  await supabase.from("bicycle_withdrawals").update({
   sweep_query_id:sweepQueryId,sweep_tx_hash:sweepHash,status:"broadcast_unknown",
   updated_at:new Date().toISOString()
  }).eq("id",withdrawal.id);
  console.error("[withdrawal] source-to-main sweep failed or is uncertain",message,sweepResponse);
  return json({success:false,status:"broadcast_unknown",query_id:queryId,sweep_query_id:sweepQueryId,
   sweep_status:"unknown",sweep_tx_hash:sweepHash,error:message,sweep_response:sweepResponse,
   admin_review_required:true,
   message:"The sweep outcome is not confirmed. Check the transaction before retrying; no payout was submitted.",
   sweep_tonviewer_url:sweepHash?"https://tonviewer.com/transaction/"+sweepHash:null},202);
 }

 // Only start the main-wallet payout after Bicycle acknowledges the source-to-main sweep.
 const withdrawalPath=currency==="USDT"?"/v1/withdrawal/direct-usdt":"/v1/withdrawal/direct-ton";
 let payoutResponse:any=null;
 try{
  const payoutStarted=Date.now();
  payoutResponse=await bicycleFetch(withdrawalPath,"POST",{
   query_id:queryId,currency,amount:currency==="TON"?rawAmount:numericAmount,destination,comment:"",binary_comment:""
  });
  console.log("[withdrawal] main-wallet payout response ms",Date.now()-payoutStarted);
  const payoutSubmitted=payoutResponse?.submitted===true||payoutResponse?.broadcast===true||
   ["broadcast","processing","completed","confirmed"].includes(String(payoutResponse?.status||"").toLowerCase())||
   transactionHash(payoutResponse)!==null||payoutResponse?.success===true;
  if(payoutResponse?.success===false||!payoutSubmitted){
   throw new Error("Bicycle did not acknowledge the main-wallet payout broadcast");
  }
 }catch(error){
  const message=error instanceof Error?error.message:String(error);
  await supabase.from("bicycle_withdrawals").update({
   sweep_query_id:sweepQueryId,sweep_tx_hash:sweepHash,status:"broadcast_partial",
   updated_at:new Date().toISOString()
  }).eq("id",withdrawal.id);
  console.error("[withdrawal] sweep succeeded but payout is uncertain",message);
  return json({success:false,status:"broadcast_partial",query_id:queryId,sweep_query_id:sweepQueryId,
   sweep_tx_hash:sweepHash,sweep_tonviewer_url:sweepHash?"https://tonviewer.com/transaction/"+sweepHash:null,
   withdrawal_error:message,admin_review_required:true},502);
 }

 const finalHash=transactionHash(payoutResponse);
 const bicycleId=payoutResponse?.ID||payoutResponse?.id||null;
 const providerStatus=String(payoutResponse?.status||"").toLowerCase();
 const payoutStatus=["completed","confirmed"].includes(providerStatus)?"completed":"broadcast";
 const finalStatus=sweepConfirmationUnknown?"broadcast_partial":payoutStatus;
 const{error:updateWithdrawalError}=await supabase.from("bicycle_withdrawals").update({
  bicycle_id:bicycleId,sweep_query_id:sweepQueryId,sweep_tx_hash:sweepHash,
  final_tx_hash:finalHash,status:finalStatus,updated_at:new Date().toISOString()
 }).eq("id",withdrawal.id);
 if(updateWithdrawalError)throw updateWithdrawalError;

 return json({success:true,status:finalStatus,query_id:queryId,withdrawal_id:withdrawal.id,
  currency,amount:numericAmount,destination,fee_percent:feePercent,fee_amount:feeAmount,fixed_fee_ton:currency==="TON"?fixedFee:0,total_debit:totalDebit,
  sweep:{query_id:sweepQueryId,status:sweepConfirmationUnknown?"unknown":"broadcast",transaction_hash:sweepHash,response:sweepResponse},
  withdrawal:{status:finalStatus,transaction_hash:finalHash,response:payoutResponse},
  sweep_tonviewer_url:sweepHash?"https://tonviewer.com/transaction/"+sweepHash:tonViewerUrl(sweepResponse),
  withdrawal_tonviewer_url:finalHash?"https://tonviewer.com/transaction/"+finalHash:tonViewerUrl(payoutResponse),
  sweep_confirmation_unknown:sweepConfirmationUnknown,
  confirmation:finalStatus==="completed"&&!sweepConfirmationUnknown?"provider_confirmed":"not_checked",
  message:sweepConfirmationUnknown?"Payout was submitted without waiting for sweep confirmation. Sweep outcome remains unknown; verify both transactions later.":undefined});
  }catch(error){
   const message=error instanceof Error?error.message:String(error);
   const status=sweepAttempted?"broadcast_unknown":"failed";
   await supabase.from("bicycle_withdrawals").update({status,error:message,updated_at:new Date().toISOString()}).eq("id",withdrawal.id);
   await supabase.from("bicycle_sweep_requests").update({status:sweepAttempted?"unknown":"failed",error:message,updated_at:new Date().toISOString()}).eq("id",sweepRow.id);
   console.error("[withdrawal] background task error",status,message);
  }
 })();
 runtime.waitUntil(task);
 return json({success:true,accepted:true,status:"processing",query_id:queryId,withdrawal_id:withdrawal.id,
  sweep_query_id:sweepQueryId,currency,amount:numericAmount,fee_percent:feePercent,fee_amount:feeAmount,fixed_fee_ton:currency==="TON"?fixedFee:0,total_debit:totalDebit,destination,
  message:"Withdrawal accepted. Source-to-main sweep and main-wallet payout are processing in the background."},202);

}
 return json({error:"Unsupported action"},400);

 }catch(error){
 console.error(error);

 return json({
 error:
 error instanceof Error
 ?error.message
 :"Unknown error"
 },500);
 }
 });