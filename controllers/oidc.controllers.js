import crypto from "crypto";
import * as jose from "jose";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db/index.ts";
import { usersTable } from "../src/db/schema.ts";
import { jwk, privateKey, publicKey } from "../keys.js";
import { authCodesTable } from "../src/db/schema.ts";


const clientController = async(req,res) => {
    const {client_id, redirect_uri} = req.query;

    // in query we just want client id and redirect_uri , if client id is there we take the user to signup,sigin page else , we take app owner to a pafge whjere they will post theoir client id and client secret to get registered with our service
    //search for client id in db if not there then take client id and client secret and register the app and then redirect to signup page

    if(!client_id){
        return res.status(400).json({error:"Client id is required"});
    }
    
    const [existing] = await db
    .select({ id: authCodesTable.id })
    .from(authCodesTable)
    .where(eq(authCodesTable.clientId, client_id))
    .limit(1);

    if(!existing){
        const redirectParam = redirect_uri
            ? `&redirect_uri=${encodeURIComponent(redirect_uri)}`
            : "";
        return res.redirect(`/client-register.html?client_id=${encodeURIComponent(client_id)}${redirectParam}`);
    }

    const redirectParam = redirect_uri
        ? `&redirect_uri=${encodeURIComponent(redirect_uri)}`
        : "";
    return res.redirect(`/auth.html?clientId=${encodeURIComponent(client_id)}${redirectParam}`);
}

const clientRegistrationController = async (req,res) => {
    const {client_id,client_secret,redirect_uri} = req.body;

    if(!client_id || !client_secret){
        return res.status(400).json({error:"Client id and client secret are required"});
    }

    // we will just store the client id and client secret in db and then redirect to signup page
    //first check if that client id is already there in db or not if there then return error else store the client id and client secret in db and then redirect to signup page
    const [existing] = await db
    .select({ id: authCodesTable.id })
    .from(authCodesTable)
    .where(eq(authCodesTable.clientId, client_id))
    .limit(1);

    if(existing){
        return res.status(400).json({error:"Client id already exists"});
    }

    await db.insert(authCodesTable).values({
        clientId: client_id,
        clientSecret: client_secret,
        code: "",
        email: "",
        expiresAt: new Date()
    });

    const redirectParam = redirect_uri
        ? `&redirect_uri=${encodeURIComponent(redirect_uri)}`
        : "";
    return res.redirect(`/auth.html?clientId=${encodeURIComponent(client_id)}${redirectParam}`);
}


const authController = async(req,res) => {

    const {clientId,redirect_uri} = req.query;

    if(!clientId || !redirect_uri){
        return res.status(400).json({error:"Client id and redirect uri are required"});
    }

    const [existing] = await db
    .select({ id: authCodesTable.id })
    .from(authCodesTable)
    .where(eq(authCodesTable.clientId, clientId))
    .limit(1);

    if(!existing){
        return res.redirect(`/client-register.html?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirect_uri)}`);
    }

    res.redirect(`/auth.html?clientId=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirect_uri)}`);
}


const signupController = async (req,res) => {
    const {firstName,lastName,email,password} = req.body;

    if(!firstName || !lastName || !email || !password){
        return res.status(400).json({error:"All fields are required"});
    }

    const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

    if (existing) {
        res
        .status(409)
        .json({ message: "An account with this email already exists." });
        return;
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto
        .createHash("sha256")
        .update(password + salt)
        .digest("hex");

    await db.insert(usersTable).values({
        firstName,
        lastName: lastName ?? null,
        email,
        password: hash,
        salt,
    });

    res.status(201).json({ ok: true });
}

const signinController = async (req,res) => {
    const {clientId,redirect_uri} = req.query;
    if(!clientId || !redirect_uri){
        return res.status(400).json({error:"Client id and redirect uri are required"});
    }
    const {email,password} = req.body;
    if(!email || !password){
        return res.status(400).json({error:"All fields are required"});
    }

    const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

    if(!existing){
        return res.status(400).json({error:"Invalid credentials"});
    }

    const salt = existing.salt;
    const hash = crypto
        .createHash("sha256")
        .update(password + salt)
        .digest("hex");

    if(hash !== existing.password){
        return res.status(400).json({error:"Invalid credentials"});
    }

    // lets make a code and reverify it when the user hits the /token endpoint
    const code = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 10*60*1000); // code is valid for 10 minutes

    const [clientRecord] = await db
        .select({ clientSecret: authCodesTable.clientSecret })
        .from(authCodesTable)
        .where(eq(authCodesTable.clientId, clientId))
        .limit(1);

    if (!clientRecord) {
        return res.status(400).json({ error: "Invalid client id" });
    }

    await db.insert(authCodesTable).values({
        clientId: clientId,
        clientSecret: clientRecord.clientSecret,
        code,
        email,
        expiresAt
    });

    return res.json({code});
}

const tokenController = async (req,res) => { 
    // in this endpoint we will take the code and client id and client secret from query and then verify the code and then return the token
    const {code,clientId,clientSecret} = req.query;

    if(!code || !clientId || !clientSecret){
        return res.status(400).json({error:"Code, client id and client secret are required"});
    }

    const [existing] = await db
    .select()
    .from(authCodesTable)
    .where(and(
        eq(authCodesTable.code, code),
        eq(authCodesTable.clientId, clientId),
        eq(authCodesTable.clientSecret, clientSecret)
    ))
    .limit(1);

    if(!existing){
        return res.status(400).json({error:"Invalid code, client id or client secret"});
    }

    if(existing.expiresAt < new Date()){
        return res.status(400).json({error:"Code has expired"});
    }

    // generate token using private key and return it with payload email 
    const token = await new jose.SignJWT({email: existing.email})
    .setProtectedHeader({ alg: 'RS256' })
    .setExpirationTime('1h')
    .sign(privateKey);
    return res.status(200).json({token});
}

const userController = async(req,res) => {

    const {token,redirect_uri} = req.query;

    if(!token || !redirect_uri){
        return res.status(400).json({error:"Token is required"});
    }

    try {
        // fetch public key from the endpoint /o/key and then verify the token and then return the email in query and then redirect to the redirect uri with email in query
        // public key is at /o/key endpoint

        const publicKeyResponse = await fetch(`${req.protocol}://${req.get('host')}/o/key`);
        const {keys} = await publicKeyResponse.json();
        const publicKeyfetched = await jose.importJWK(keys[0], 'RS256');

        const {payload} = await jose.jwtVerify(token, publicKeyfetched);
        const email = payload.email;

        const [existing] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, email))
        .limit(1);
        if(!existing){
            return res.status(400).json({error:"User not found"});
        }
        res.cookie("mc_token", token, {
            httpOnly: true,
            sameSite: "lax",
            maxAge: 60 * 60 * 1000,
        });
        return res.redirect(`${redirect_uri}?email=${email}&name=${existing.firstName}`);
    } catch (error) {
        return res.status(400).json({error:"Invalid token"});
    }

}


export { authController,signupController,signinController,clientController,clientRegistrationController,tokenController,userController };