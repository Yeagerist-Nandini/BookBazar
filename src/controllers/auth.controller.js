import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { db } from "../utils/db.js";
import { ApiResponse } from "../utils/api-response.js";
import { UserRole } from "../generated/prisma/index.js";
import crypto from "crypto"
import bcrypt from "bcryptjs";
import { emailVerificationMailgenContent, forgotPasswordMailgenContent, sendMail } from "../utils/mail.js";


const resendEmailVerificationMail = async(user) => {
    //create verification token 
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const emailVerificationUrl = `${process.env.BASE_URL}/api/v1/auth/verify/${emailVerificationToken}`

    
    const updated_user = await db.user.update({
        where: { id: user.id },
        data: {
            emailVerificationToken,
            emailVerificationTokenExpiry: new Date(Date.now() + (20*60*1000))
        }
    });

    const mailOptions = {
        email: user.email,
        subject: 'BookBazar Email Verification',
        mailgenContent: emailVerificationMailgenContent(user.name, emailVerificationUrl)
    }

    await sendMail(mailOptions);

    return true
}

//TODO: 
const getAccessAndRefreshToken = async(req, res) => {

}

const refreshAccessToken = asyncHandler(async (req, res) => {

})


const register = asyncHandler(async(req, res) => {
    //get all the information from req 
    //TODO: validate it via middleware
    const {name, email, password, role} = req.body;

    // check for existing user
    const existing_user = await db.user.findUnique({
        where: { email: email }
    });

    if(existing_user){
        throw new ApiError(400, "User already exist for this email");
    }

    // hash password 
    const hashed_password = await bcrypt.hash(password, 10);

    // save it to the db 
    const user = await db.user.create({
        data: {
            name,
            email,
            password: hashed_password,
            role: role? role: UserRole.USER
        }
    });

    if(!user){
        throw new ApiError(500, "User registration failed!");
    }

    // generate verification token 
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const emailVerificationTokenExpiry = new Date(Date.now() + (20*60*1000));

    user = await db.user.update({
        where: { id: user.id },
        data: {
            emailVerificationToken,
            emailVerificationTokenExpiry
        }
    });

    // send verification email
    const emailVerificationUrl = `${process.env.BASE_URL}/api/v1/auth/verify/${emailVerificationToken}`

    const mailOptions = {
        email: user.email,
        subject: 'BookBazar Email Verification',
        mailgenContent: emailVerificationMailgenContent(user.name, emailVerificationUrl)
    }

    await sendMail(mailOptions);

    return res
            .status(200)
            .json(new ApiResponse(200, user, "User Registration Successfull!"))
})


const login = asyncHandler( async(req, res) => { 
    //get data 
    //TODO: validate it
    const { email, password } = req.body;

    // get user with this email
    const user = await db.user.findUnique({
        where: { email: email }
    });
    if(!user) throw new ApiError(404, "User not found");

    //check if the passwords matches
    const isPasswordMatching = await bcrypt.compare(password, user.password);
    if(!isPasswordMatching) throw new ApiError(400, "Invalid Credentials");

    //check if the email is verified
    if(!user.isEmailVerified){
        await resendEmailVerificationMail(user);
        throw new ApiError(400, "Email is not verified. Verification email is sent");
    }

    //generate refresh and access token
    const { accessToken, refreshToken } = await getAccessAndRefreshToken(user.id);

    //save it into cookie
    const cookieOptions = {
        httpOnly: true,
        secure: true
    }

    const user_data = {
        id : user.id,
        email:  user.email,
        username: user.name,
        role: user.role
    }

    return res
        .status(200)
        .cookie("accessToken", accessToken, cookieOptions)
        .cookie("refreshToken", refreshToken, cookieOptions)
        .json(new ApiResponse(200, user_data, "Login Successfull"));
})


const logout = asyncHandler(async(req, res) => {
    // clear the cookies to logout
    await db.user.update({
        where: { id: req.user.id },
        data: { refreshToken: null }
    });

    const cookieOptions = {
        httpOnly: true,
        secure: true
    }

    return res
        .status(200)
        .clearCookie("accessToken", cookieOptions)
        .clearCookie("refreshToken", cookieOptions)
        .json(new ApiResponse(200, {}, "user loggedout successfully!"));
})


const verifyEmail = asyncHandler(async(req, res) => {
    // get verification token 
    const { token } = req.params;
    if(!token) throw new ApiError(400, "invalid token");

    // check if it's valid 
    const user = await db.user.findUnique({
        where: { 
            emailVerificationToken: token,
            emailVerificationTokenExpiry: { gt: new Date(Date.now()) },
        }
    })

    if(!user) throw new ApiError(400, "Invalid verification token");

    // verify the user
    const verifiedUser = await db.user.update({
        where: { id: user.id },
        data: {
            emailVerificationToken: null,
            emailVerificationTokenExpiry: null,
            isEmailVerified : true
        }
    })
    if (!verifiedUser) throw new ApiError(500, "Email verification failed");

    return res 
        .status(200)
        .json(new ApiResponse(200, user.id, "Email Verification successfull!"));
})


const forgotPasswordRequest = asyncHandler(async(req, res) => {
    const {email} = req.body;

    // check if user exist?
    const user = await db.user.findUnique({
        where: { email: email },
        select:{
            id: true,
            email: true,
            name: true
        }
    });
    if(!user) throw new ApiError(404, "User not found");

    //generate reset password url
    const forgotPasswordToken = crypto.randomBytes(32).toString('hex');
    const resetPasswordUrl = `${process.env.BASE_URL}/api/v1/reset-password/${forgotPasswordToken}`

    //save details to db 
    const updated_user = await db.user.update({
        where: { id: user.id },
        data: {
            forgotPasswordToken,
            forgotPasswordExpiry: new Date(Date.now() + 20*60*1000)
        }
    });
    if (!updated_user) throw new ApiError(500, "Error while processing forgot Password Request");


    // mail it
    const mailOptions = {
        email: user.email,
        subject: "Reset your password",
        mailgenContent: forgotPasswordMailgenContent(user.name, resetPasswordUrl)
    }
    await sendMail(mailOptions);

    return res
           .status(200)
           .json(new ApiResponse(200, resetPasswordUrl, "Reset password link sent to your email."))
})


const resetForgottenPassword = asyncHandler(async(req, res) => {
    const { token } = req.params;
    if(!token) throw new ApiError(400, "invalid token");
    ///TODO: validate
    const { password } = req.body;

    //check if token is valid
    const user = await db.user.findUnique({
        where:{
            forgotPasswordToken: token,
            forgotPasswordTokenExpiry: { gt: new Date(Date.now())}
        }
    });
    if(!user) throw new ApiError(404, "Invalid token");

    const hashed_password = await bcrypt.hash(password, 10);

    // update password
    const updated_user = await db.user.findUnique({
        where: { id: user.id  },
        data: {
            password: hashed_password,
            forgotPasswordToken: null,
            forgotPasswordTokenExpiry: null
        }
    });
    if(!updated_user) throw new ApiError(500, "Error while processing reset password request");

    return res
        .status(200)
        .json(new ApiResponse(200, user.id, "New password created successfully"));
})


const getCurrentUser = asyncHandler(async(req, res) => {
    const { userId } = req.user.id;

    const user = await db.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            name: true,
            role: true
        }
    });

    if (!user) throw new ApiError(404, "User not found");

    return res
        .status(200)
        .json(new ApiResponse(200, user, "Fetched current user successfully"));
})


export {
    forgotPasswordRequest,
    getCurrentUser,
    login,
    logout,
    refreshAccessToken,
    register,
    resetForgottenPassword,
    verifyEmail,
};  

////////////////////////////////////////////////
// is there any better options to store access token other than cookies ?
// salt bcryptjs 
// const emailVerificationToken = crypto.randomBytes(32).toString('hex');