class ApiError extends Error{
    constructor(
        statusCode, 
        message,
        errors = [],
        stack = ""
    ){
        this.statusCode = statusCode;
        this.message = message;
        this.errors = errors;
        this.success = false;

        if(stack){
            this.stack = stack;
        }else{
            Error.captureStackTrace(this, this.constructor);
            // This sets this.stack to a clean trace that starts from where the custom error is instantiated, not from the internal Error constructor.
        }
    }
}

export {ApiError};

// The stack is a stack trace — it's a string that tells you where the error occurred, showing the function call sequence (the "stack") that led to the error. It helps with debugging.