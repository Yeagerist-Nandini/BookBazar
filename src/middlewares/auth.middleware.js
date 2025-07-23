import {ApiError} from '../utils/api-error.js'

export const isLoggedIn = (req, res, next) => {
    try {
        req.user = {
            "name": "nandini"
        }
        
        next();
    } catch (error) {
        throw new ApiError(500, "Internal Server Error", [error]);
    }
}


export const isSeller = (req, res, next) => {
    try {
        
        next();
    } catch (error) {
        throw new ApiError(500, "Internal Server Error", [error]);
    }
}