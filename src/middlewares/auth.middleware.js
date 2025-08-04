import {ApiError} from '../utils/api-error.js'
import { db } from '../utils/db.js';
import jwt from "jsonwebtoken";

export const isLoggedIn = (req, res, next) => {
    try {
        const accessToken = req.cookies?.accessToken;

        if(!accessToken) throw new ApiError(401, "Authentication Failed!!");

        const payload = jwt.verify(accessToken, process.env.ACCESS_TOKEN_REQUEST);
        req.user = payload; 

        next();
    } catch (error) {
        throw new ApiError(500, "Internal Server Error", [error]);
    }
}


export const isAdmin = async(req, res, next) => {
    try {
        const { id, role } = req.user;

        if(role!=="ADMIN"){
            throw next(new ApiError(401, "You are not authorized"));
        }
        
        next();
    } catch (error) {
        throw new ApiError(401, "You are not authorized", [error]);
    }
}