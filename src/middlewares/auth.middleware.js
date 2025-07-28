import {ApiError} from '../utils/api-error.js'
import { db } from '../utils/db.js';

export const isLoggedIn = (req, res, next) => {
    try {
        
        req.user = payload;

        next();
    } catch (error) {
        throw new ApiError(500, "Internal Server Error", [error]);
    }
}


export const isAdmin = async(req, res, next) => {
    try {
        const { id } = req.user;

        const user = await db.user.findUnique({
            where: {id},
            select: {role: true}
        });

        if(!user || user.role!=="ADMIN"){
            throw next(new ApiError(401, "You are not authorized"));
        }
        
        next();
    } catch (error) {
        throw new ApiError(401, "You are not authorized", [error]);
    }
}