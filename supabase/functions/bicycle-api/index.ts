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

const BICYCLE_API_URL=Deno.env.get("BICYCLE_API_URL")!;
const BICYCLE_API_TOKEN=Deno.env.get("BICYCLE_API_TOKEN")!;

async function bicycleFetch(path:string,method="GET",body?:unknown){
const response=await fetch(`${BICYCLE_API_URL}${path}`,{
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
const data=await bicycleFetch(
`/v1/balance?currency=TON&address=${encodeURIComponent(address)}`
);

const rawBalance=String(
data?.balance??data?.result??"0"
);

const nanoTon=Number(rawBalance);

const balanceTon=Number.isFinite(nanoTon)
?nanoTon/1_000_000_000
:0;

return{
balance:balanceTon,
balance_raw:rawBalance
};
}

async function getUsdtBalance(address:string){
const jettonMaster=
"0:B113A994B5024A16719F69139328EB759596C38A25F59028B146FECDC3621DFE";

const response=await fetch(
`https://toncenter.com/api/v3/jetton/wallets?owner_address=${encodeURIComponent(address)}&jetton_address=${encodeURIComponent(jettonMaster)}&limit=100`
);

const text=await response.text();
let data:any;

try{data=JSON.parse(text)}
catch{throw new Error("Invalid TON Center response")}

if(!response.ok)
throw new Error(
data?.error||
data?.message||
`TON Center HTTP ${response.status}`
);

const wallet=
Array.isArray(data?.jetton_wallets)
?data.jetton_wallets[0]
:null;

const rawBalance=String(wallet?.balance??"0");
const raw=Number(rawBalance);

const usdtBalance=Number.isFinite(raw)
?raw/1_000_000
:0;

return{
balance:usdtBalance,
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

if(action==="address"){
const currency=String(
body.currency||""
).toUpperCase();

if(!["TON","USDT"].includes(currency))
return json({
error:"Currency must be TON or USDT"
},400);

const{data:saved,error}=await supabase
.from("bicycle_deposit_addresses")
.select("address")
.eq("user_id",userId)
.eq("currency",currency)
.maybeSingle();

if(error)throw error;

if(saved?.address)
return json({
address:saved.address,
currency,
user_id:userId,
saved:true
});

const bicycle=await bicycleFetch(
"/v1/address/new",
"POST",
{
user_id:userId,
currency
}
);

if(!bicycle?.address)
throw new Error("Bicycle did not return an address");

const{error:insertError}=await supabase
.from("bicycle_deposit_addresses")
.insert({
user_id:userId,
currency,
address:bicycle.address
});

if(insertError){
const{data:existing}=await supabase
.from("bicycle_deposit_addresses")
.select("address")
.eq("user_id",userId)
.eq("currency",currency)
.maybeSingle();

if(existing?.address)
return json({
address:existing.address,
currency,
user_id:userId,
saved:true
});

throw insertError;
}

return json({
address:bicycle.address,
currency,
user_id:userId,
saved:true
});
}

if(action==="balance"){
const currency=String(body.currency||"USDT").toUpperCase();
if(!["TON","USDT"].includes(currency)) return json({error:"Currency must be TON or USDT"},400);
let{data:saved,error}=await supabase.from("bicycle_deposit_addresses").select("address").eq("user_id",userId).eq("currency",currency).maybeSingle();
if(error)throw error;
let address=saved?.address;
if(!address){
const created=await bicycleFetch("/v1/address/new","POST",{user_id:userId,currency});
address=created?.address;
if(!address)throw new Error("Bicycle did not return a "+currency+" address");
const{error:insertError}=await supabase.from("bicycle_deposit_addresses").insert({user_id:userId,currency,address});
if(insertError){
const{data:existing,error:readError}=await supabase.from("bicycle_deposit_addresses").select("address").eq("user_id",userId).eq("currency",currency).maybeSingle();
if(readError||!existing?.address)throw insertError;
address=existing.address;
}
}
if(currency==="TON"){
const ton=await getTonBalance(address);
await saveBalanceSnapshot(userId,"TON",address,ton.balance,ton.balance_raw);
return json({currency:"TON",address,balance:ton.balance_raw,balance_ton:ton.balance});
}
const usdt=await getUsdtBalance(address);
await saveBalanceSnapshot(userId,"USDT",address,usdt.balance,usdt.balance_raw);
return json({currency:"USDT",address,jetton_wallet:usdt.jetton_wallet,jetton_master:usdt.jetton_master,balance:usdt.balance_raw,usdt_balance:usdt.balance,decimals:6});
} if(action==="sync_balance"){
const results:any[]=[];

for(const currency of["TON","USDT"]){
const{data:saved,error}=await supabase
.from("bicycle_deposit_addresses")
.select("address")
.eq("user_id",userId)
.eq("currency",currency)
.maybeSingle();

if(error)throw error;

if(!saved?.address){
results.push({
currency,
address:null,
balance:0,
balance_raw:"0",
skipped:true
});
continue;
}

if(currency==="TON"){
const ton=await getTonBalance(saved.address);

const snapshot=await saveBalanceSnapshot(
userId,
"TON",
saved.address,
ton.balance,
ton.balance_raw
);

results.push(snapshot);
}else{
const usdt=await getUsdtBalance(saved.address);

const snapshot=await saveBalanceSnapshot(
userId,
"USDT",
saved.address,
usdt.balance,
usdt.balance_raw
);

results.push({
...snapshot,
jetton_wallet:usdt.jetton_wallet,
jetton_master:usdt.jetton_master
});
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

if(action==="withdrawal_status"){const queryId=String(body.query_id||"").trim();if(!queryId)return json({error:"Missing query_id"},400);const{data:row,error}=await supabase.from("bicycle_withdrawals").select("*").eq("user_id",userId).eq("query_id",queryId).maybeSingle();if(error)throw error;if(!row)return json({error:"Withdrawal not found"},404);return json({local:row,status:row.status,query_id:queryId});} 
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
if(numericAmount>availableBalance)return json({error:"Insufficient available "+currency+" balance after P2P reservations",currency,blockchain_balance:liveBalance,locked_balance:lockedBalance,available_balance:availableBalance,requested_amount:numericAmount},400);
const{data:transfer,error:insertError}=await supabase.from("bicycle_withdrawals").insert({user_id:userId,query_id:queryId,currency,amount:numericAmount,destination,status:"processing"}).select().single();
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
 const{data:row,error}=await supabase.from("bicycle_sweep_requests").select("id,currency,amount,source_address,destination_address,query_id,status,error,created_at,updated_at").eq("user_id",userId).eq("query_id",queryId).maybeSingle();
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
 const{data:existing,error:existingError}=await supabase.from("bicycle_sweep_requests").select("*").eq("query_id",queryId).maybeSingle();
 if(existingError)throw existingError;
 if(existing)return json(existing);
 const{data:wallet,error:walletError}=await supabase.from("bicycle_deposit_addresses").select("address").eq("user_id",userId).eq("currency",currency).maybeSingle();
 if(walletError)throw walletError;
 const sourceAddress=String(wallet?.address||"").trim();
 if(!sourceAddress)return json({error:"No registered "+currency+" deposit address found"},404);
 const live=currency==="TON"?await getTonBalance(sourceAddress):await getUsdtBalance(sourceAddress);
 const{data:lockedData,error:lockedError}=await supabase.rpc("get_p2p_locked_balance",{p_user_id:userId,p_currency:currency});
 if(lockedError)throw lockedError;
 const locked=Math.max(0,Number(lockedData||0));
 const feeReserve=currency==="TON"?0.05:0;
 const available=Math.max(0,Number(live.balance||0)-locked-feeReserve);
 if(amount>available)return json({error:"Insufficient available "+currency+" balance for main-wallet sweep",blockchain_balance:live.balance,locked_balance:locked,fee_reserve:feeReserve,available_balance:available,requested_amount:amount},400);
 const{data:created,error:insertError}=await supabase.from("bicycle_sweep_requests").insert({
  user_id:userId,requested_by:userId,currency,amount,source_address:sourceAddress,
  destination_address:"BICYCLE_MAIN_WALLET",query_id:queryId,status:"processing"
 }).select().single();
 if(insertError){
  if(insertError.code==="23505"){
   const{data:duplicate}=await supabase.from("bicycle_sweep_requests").select("*").eq("query_id",queryId).maybeSingle();
   if(duplicate)return json(duplicate);
  }
  throw insertError;
 }
 try{
  const rawAmount=currency==="TON"?Math.round(amount*1_000_000_000):Math.round(amount*1_000_000);
  const bicycle=await bicycleFetch("/v1/admin/sweep-to-main","POST",{
   user_id:userId,source_address:sourceAddress,currency,amount:rawAmount,query_id:queryId
  });
  const destination=String(bicycle?.destination||"BICYCLE_MAIN_WALLET");
  const{data:updated,error:updateError}=await supabase.from("bicycle_sweep_requests").update({
   destination_address:destination,status:"submitted",bicycle_response:bicycle,error:null,updated_at:new Date().toISOString()
  }).eq("id",created.id).select().single();
  if(updateError)throw updateError;
  return json(updated,202);
 }catch(error){
  const message=error instanceof Error?error.message:String(error);
  await supabase.from("bicycle_sweep_requests").update({status:"unknown",error:message,updated_at:new Date().toISOString()}).eq("id",created.id);
  return json({error:message,status:"unknown",query_id:queryId},502);
 }
}
if(action==="withdrawal"){
const currency=String(
body.currency||""
).toUpperCase();

const destination=String(
body.destination||""
).trim();

const queryId=String(
body.query_id||
crypto.randomUUID()
);

if(!["TON","USDT"].includes(currency))
return json({
error:"Currency must be TON or USDT"
},400);

if(!destination)
return json({
error:"Missing destination"
},400);

const numericAmount=Number(body.amount); if(!Number.isFinite(numericAmount)||numericAmount<=0) return json({ error:`Withdrawal amount must be greater than zero`, minimum_amount:0, currency },400);

if(
!Number.isFinite(numericAmount)||
numericAmount<=0
)
return json({
error:"Invalid amount"
},400);

const{data:existing}=await supabase
.from("bicycle_withdrawals")
.select("*")
.eq("user_id",userId)
.eq("query_id",queryId)
.maybeSingle();

if(existing)
return json(existing);
const{data:depositAddress,error:depositAddressError}=await supabase
.from("bicycle_deposit_addresses")
.select("address")
.eq("user_id",userId)
.eq("currency",currency)
.maybeSingle();
if(depositAddressError)throw depositAddressError;
if(!depositAddress?.address)return json({error:`No Bicycle ${currency} address found`},400);

// Resolve the canonical username and pass the saved source wallet explicitly.
// Bicycle's direct withdrawal handler needs both to locate the user's TON wallet.
const{data:withdrawalProfile,error:withdrawalProfileError}=await supabase
.from("profiles")
.select("username")
.eq("id",userId)
.maybeSingle();
if(withdrawalProfileError)throw withdrawalProfileError;
const withdrawalUsername=String(withdrawalProfile?.username||"").trim().replace(/^@/,"").toLowerCase();
if(!withdrawalUsername)return json({error:"Your P2P Social username is not linked to your wallet"},409);
const sourceAddress=String(depositAddress.address).trim();
if(!sourceAddress)return json({error:`No saved personal ${currency} wallet address found`},409);
const liveBalance=currency==="TON"
?(await getTonBalance(sourceAddress)).balance
:(await getUsdtBalance(sourceAddress)).balance;
const{data:lockedData,error:lockedError}=await supabase.rpc(
"get_p2p_locked_balance",
{p_user_id:userId,p_currency:currency}
);
if(lockedError)throw lockedError;
const lockedBalance=Math.max(0,Number(lockedData||0));
const availableBalance=Math.max(0,liveBalance-lockedBalance);
if(numericAmount>availableBalance){
return json({
error:`Insufficient available ${currency} balance after P2P reservations`,
currency,
blockchain_balance:liveBalance,
locked_balance:lockedBalance,
available_balance:availableBalance,
requested_amount:numericAmount
},400);
}


const{
data:withdrawal,
error
}=await supabase
.from("bicycle_withdrawals")
.insert({
user_id:userId,
query_id:queryId,
currency,
amount:numericAmount,
destination,
status:"processing"
})
.select()
.single();

if(error)throw error;

try{
const withdrawalPath=
currency==="USDT"
?"/v1/withdrawal/direct-usdt"
:"/v1/withdrawal/direct-ton";

const bicycle=await bicycleFetch(
withdrawalPath,
"POST",
{
user_id:userId,
username:withdrawalUsername,
source_address:sourceAddress,
query_id:queryId,
currency,
amount:currency==="TON"?Math.round(numericAmount*1_000_000_000):numericAmount, destination, comment:"", binary_comment:""
}
);

const bicycleId=bicycle?.ID||bicycle?.id||null;
const status=String(bicycle?.status||"").toLowerCase();
const safeStatus=["completed","processing","failed","cancelled"].includes(status)?status:(bicycleId?"processing":"failed");
await supabase.from("bicycle_withdrawals").update({bicycle_id:bicycleId,status:safeStatus,updated_at:new Date().toISOString()}).eq("id",withdrawal.id);
return json({...withdrawal,bicycle_id:bicycleId,status:safeStatus,bicycle,endpoint:withdrawalPath});
}catch(error){
await supabase
.from("bicycle_withdrawals")
.update({
status:"failed",
updated_at:new Date().toISOString()
})
.eq("id",withdrawal.id);

throw error;
}
}

return json({
error:"Continue in file 2"
},400);

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

// Source: active Supabase Edge Function bicycle-api (version 74 at copy time).
// Leading whitespace was normalized only; no application logic was intentionally changed.
