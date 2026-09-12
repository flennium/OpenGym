import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { GymDatabase, hashPin } from "../dist/main/database.js";

const output = resolve(process.argv[2] || "release/OpenGym-Demo-500.db");
mkdirSync(dirname(output), { recursive: true });
for (const suffix of ["", "-wal", "-shm"]) if (existsSync(output + suffix)) rmSync(output + suffix);
let seed = 20260912;
const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = (items) => items[Math.floor(random() * items.length)];
const iso = (daysAgo = 0, hour = 8, minute = 0) => { const date = new Date(); date.setDate(date.getDate() - daysAgo); date.setHours(hour, minute, 0, 0); return date.toISOString(); };
const dateOnly = (daysFromToday = 0) => { const date = new Date(); date.setDate(date.getDate() + daysFromToday); return date.toISOString().slice(0, 10); };

const gym = new GymDatabase(output);
gym.setup({ gymName: "Atlas Fitness Alger", ownerName: "Amel Boudiaf", pin: "123456", locale: "fr-DZ", currency: "DZD", timezone: "Africa/Algiers" });
const db = gym.db;
db.transaction(() => {
  const staff = [["Karim Benyahia",2,"234567"],["Nadia Bouzid",3,"345678"],["Yacine Ait Ahmed",3,"456789"],["Lina Meziane",4,"567890"]];
  const insertStaff = db.prepare("INSERT INTO staff(name,role_id,pin_hash,created_at,updated_at) VALUES(?,?,?,?,?)");
  staff.forEach(([name,role,pin], index) => insertStaff.run(name, role, hashPin(pin), iso(180-index*12), iso(index)));
  const preference = db.prepare("INSERT INTO staff_preferences(staff_id,theme,dark_mode,updated_at) VALUES(?,?,?,?)");
  ["Pulse","Ocean","Mint","Violet","Gold"].forEach((theme,index) => preference.run(index+1, theme, index===4?0:1, iso(index)));
  const requirement = db.prepare("INSERT INTO document_requirements(name,created_at) VALUES(?,?)");
  const medicalId = Number(requirement.run("Certificat médical d'aptitude",iso(200)).lastInsertRowid);
  const waiverId = Number(requirement.run("Règlement intérieur signé",iso(200)).lastInsertRowid);
  const plans = [["Mensuel Liberté","Accès illimité pendant un mois",1,null,500000],["Mensuel 30 heures","Un mois ou 30 heures d'entraînement",1,1800,420000],["Trimestriel","Accès illimité pendant trois mois",3,null,1350000],["Annuel Premium","Accès complet pendant douze mois",12,null,4800000],["Étudiant 20 heures","Formule adaptée aux étudiants",1,1200,300000],["Coaching individuel","Douze heures avec un coach",0,720,900000],["Pack 10 séances","Dix heures sans date d'expiration",0,600,250000]];
  const insertPlan = db.prepare("INSERT INTO plans(name,description,duration_months,training_minutes_limit,price_minor,created_at,updated_at) VALUES(?,?,?,?,?,?,?)");
  const planIds = plans.map((plan) => Number(insertPlan.run(...plan,iso(300),iso(3)).lastInsertRowid));
  const firstNames=["Amine","Sarah","Yasmine","Mohamed","Lina","Rayane","Nour","Sofiane","Aya","Walid","Meriem","Anis","Inès","Mehdi","Imane","Samir","Leïla","Adel","Nadia","Karim","Youcef","Ikram","Abdelkader","Manel","Massinissa","Lamia"];
  const lastNames=["Benali","Bensaid","Haddad","Mansouri","Brahimi","Ait Ali","Khelifi","Saïdi","Bouaziz","Mebarki","Hamdi","Rahmani","Cherif","Belkacem","Zerrouki","Amari","Boudiaf","Meziane","Bouzid","Benyahia"];
  const locations=[["Alger Centre","Alger"],["Bab Ezzouar","Alger"],["Bir Mourad Raïs","Alger"],["Hydra","Alger"],["El Biar","Alger"],["Kouba","Alger"],["Oran","Oran"],["Akbou","Béjaïa"],["Tizi Ouzou","Tizi Ouzou"],["Blida","Blida"],["Constantine","Constantine"],["Sétif","Sétif"]];
  const streets=["rue Didouche Mourad","boulevard Mohamed V","rue Larbi Ben M'hidi","cité 5 Juillet","lotissement El Feth","avenue de l'ALN"];
  const insertMember=db.prepare("INSERT INTO members(first_name,last_name,phone,email,date_of_birth,gender,address,emergency_name,emergency_phone,status,notes,created_at,updated_at,member_code,photo_blob,photo_mime) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const insertDocument=db.prepare("INSERT INTO member_documents(member_id,requirement_id,file_name,mime_type,file_blob,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?)");
  const insertMembership=db.prepare("INSERT INTO memberships(member_id,plan_id,start_date,end_date,status,auto_renew,training_minutes_limit,used_minutes,frozen_at,cancelled_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)");
  const insertAttendance=db.prepare("INSERT INTO attendance(member_id,checked_in_at,checked_out_at,method,staff_id,membership_id) VALUES(?,?,?,?,?,?)");
  const insertPayment=db.prepare("INSERT INTO payments(membership_id,amount_minor,method,status,receipt_number,staff_id,paid_at,refunded_at,gym_snapshot,member_snapshot) VALUES(?,?,?,?,?,?,?,?,?,?)");
  const insertLog=db.prepare("INSERT INTO activity_log(staff_id,entity_type,entity_id,action,details,created_at) VALUES(?,?,?,?,?,?)");
  const tinyPng=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=","base64");
  let receipt=1;
  for(let i=1;i<=500;i++){
    const first=pick(firstNames),last=pick(lastNames),memberStatus=i%47===0?"banned":i%19===0?"inactive":"active",createdAgo=Math.floor(random()*700),location=pick(locations),phonePrefix=pick(["05","06","07"]);
    const memberId=Number(insertMember.run(first,last,`${phonePrefix}${String(10000000+Math.floor(random()*89999999))}`,`${first}.${last}${i}@email.dz`.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase(),`${1980+i%25}-${String(1+i%12).padStart(2,"0")}-${String(1+i%27).padStart(2,"0")}`,i%2?"Female":"Male",`${1+i%180}, ${pick(streets)}, ${location[0]}, ${location[1]}`,`${pick(firstNames)} ${last}`,`06${String(10000000+Math.floor(random()*89999999))}`,memberStatus,i%11===0?"Préfère les séances du soir":i%17===0?"Contact par téléphone uniquement":"",iso(createdAgo),iso(i%20),String(1000000000+i),i%3===0?tinyPng:null,i%3===0?"image/png":null).lastInsertRowid);
    insertDocument.run(memberId,medicalId,`medical-${memberId}.png`,"image/png",tinyPng,2+i%3,iso(createdAgo)); insertDocument.run(memberId,waiverId,`waiver-${memberId}.png`,"image/png",tinyPng,2+i%3,iso(createdAgo));
    const planIndex=i%planIds.length,plan=plans[planIndex],status=i%23===0?"cancelled":i%17===0?"frozen":i%13===0?"exhausted":i%9===0&&plan[2]>0?"expired":"active",startOffset=status==="expired"?-90:-Math.floor(random()*20),endOffset=plan[2]===0?2750000:status==="expired"?-60:startOffset+plan[2]*30,used=plan[3]==null?0:status==="exhausted"?plan[3]:Math.floor(random()*plan[3]*.8);
    const membershipId=Number(insertMembership.run(memberId,planIds[planIndex],dateOnly(startOffset),dateOnly(endOffset),status,i%4===0?1:0,plan[3],used,status==="frozen"?iso(2):null,status==="cancelled"?iso(5):null,iso(createdAgo),iso(i%10)).lastInsertRowid);
    for(let visit=0;visit<2+i%7;visit++){const ago=2+(i*7+visit*11)%170,hour=6+(i+visit*3)%16,checkIn=iso(ago,hour,i*3%60),duration=35+(i*13+visit*17)%105,checkOut=new Date(new Date(checkIn).getTime()+duration*60000).toISOString();insertAttendance.run(memberId,checkIn,checkOut,visit%3===0?"code":"manual",2+(i+visit)%3,membershipId);}
    if(i<=18&&status==="active"&&memberStatus==="active")insertAttendance.run(memberId,iso(0,7+i%10,i%60),null,i%2?"code":"manual",3,membershipId);
    if(i%5!==0){const receiptNumber=`${new Date().getFullYear()}-${String(receipt++).padStart(6,"0")}`,paidAt=iso(Math.min(createdAgo,(i-1)%120)),refunded=i%37===0;insertPayment.run(membershipId,plan[4],pick(["cash","card","transfer"]),refunded?"refunded":"paid",receiptNumber,2+i%3,paidAt,refunded?iso(i%20):null,JSON.stringify({name:"Atlas Fitness Alger",locale:"fr-DZ",currency:"DZD",timezone:"Africa/Algiers",address:"24, rue Didouche Mourad, Alger Centre",phone:"0550 21 34 56",email:"contact@atlasfitness.dz",taxId:"NIF 001626089412345",receiptFooter:"Merci pour votre confiance. Bonne séance !",receiptPaper:"A4",receiptColor:"#147D5D",logoPath:null}),JSON.stringify({name:`${first} ${last}`,planName:plan[0],membershipStart:dateOnly(startOffset),membershipEnd:plan[2]===0?"9999-12-31":dateOnly(endOffset)}));}
    insertLog.run(2+i%3,"member",memberId,"created",JSON.stringify({source:"demo import",documents:2}),iso(createdAgo)); insertLog.run(2+i%3,"membership",membershipId,"assigned",JSON.stringify({plan:plan[0]}),iso(createdAgo));
  }
  db.prepare("UPDATE settings SET address=?,phone=?,email=?,tax_id=?,receipt_footer=?,receipt_color=? WHERE id=1").run("24, rue Didouche Mourad, Alger Centre","0550 21 34 56","contact@atlasfitness.dz","NIF 001626089412345","Merci pour votre confiance. Bonne séance !","#147D5D");
  db.prepare("UPDATE receipt_sequence SET next_number=? WHERE id=1").run(receipt); insertLog.run(1,"demo_data",null,"generated",JSON.stringify({members:500,staff:5,plans:7,region:"Algeria"}),new Date().toISOString());
})();
db.pragma("wal_checkpoint(TRUNCATE)");
const counts=Object.fromEntries(["staff","members","plans","memberships","attendance","payments","member_documents","activity_log"].map((table)=>[table,db.prepare(`SELECT COUNT(*) count FROM ${table}`).get().count]));
if(counts.staff!==5||counts.members!==500||counts.attendance<2000||counts.payments!==400||counts.member_documents!==1000)throw new Error(`Demo validation failed: ${JSON.stringify(counts)}`);
const validation={dashboard:gym.dashboard(),reportMembers:gym.reports(dateOnly(-30),dateOnly(0)).members.total,auditRows:gym.auditLog({search:""}).rows.length,firstMemberDocuments:gym.member(1).documents.length};
gym.close();
console.log(JSON.stringify({output,accounts:[{name:"Amel Boudiaf",role:"Owner",pin:"123456"},{name:"Karim Benyahia",role:"Admin",pin:"234567"},{name:"Nadia Bouzid",role:"Front Desk",pin:"345678"},{name:"Yacine Ait Ahmed",role:"Front Desk",pin:"456789"},{name:"Lina Meziane",role:"Trainer",pin:"567890"}],counts,validation},null,2));
