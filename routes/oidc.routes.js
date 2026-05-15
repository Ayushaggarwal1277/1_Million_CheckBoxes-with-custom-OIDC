import { Router } from "express";

import * as oidcControllers from '../controllers/oidc.controllers.js';
import { jwk } from "../keys.js";

const router = Router();

//register a route for the client to take our service , means enter the client id anmd client secret to check if thjat partivu;ar app odn registered with our service or not and then redirect to the signup page, it will bring cliwnr id in query and if that is not in db then we take hsclient id and client secret to register the app and then redirect to the signup page
router.get('/',oidcControllers.clientController);

router.post('/client/register',oidcControllers.clientRegistrationController);

router.get('/o/v1/auth',oidcControllers.authController);

router.post('/signup',oidcControllers.signupController);

router.post('/signin',oidcControllers.signinController);

router.get('/token',oidcControllers.tokenController);

router.get('/o/key',(req,res) => {
    return res.json({keys:[jwk]});
});

router.get('/o/userinfo', oidcControllers.userController);

export default router;