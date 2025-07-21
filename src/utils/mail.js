import nodemailer from "nodemailer";
import Mailgen from "mailgen";
import dotenv from "dotenv";

dotenv.config();


const sendMail = async (options) => {
    const mailGenerator = new Mailgen({
        theme: "default",
        product: {
            name: "BookBazar",
            link: "https://bookbazar.app",
        }
    })

    const emailText = mailGenerator.generatePlaintext(options.mailgenContent);
    const emailHtml = mailGenerator.generate(options.mailgenContent);

    const transporter = nodemailer.createTransport({
        host: process.env.MAILTRAP_HOST,
        port: process.env.MAILTRAP_PORT,
        secure: false, // true for 465, false for other ports
        auth: {
            user: process.env.MAILTRAP_USER,
            pass: process.env.MAILTRAP_PASSWORD,
        },
    });

    const mailOptions = {
        from: process.env.MAILTRAP_SENDER,
        to: options.email,
        subject: options.subject,
        text: emailText, // plain‑text body
        html: emailHtml, // HTML body
    }

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log("Message sent: ", info.messageId);
    } catch (error) {
        console.error(
            "Email service failed silently. Make sure you have provided your MAILTRAP credentials in the .env file"
        )
        console.error("Error: ", error);
    }
}


const emailVerificationMailgenContent = (username, verificationUrl) => {
    return {
        body: {
            name: username,
            intro: 'Welcome to Bookbazar! We\'re very excited to have you on board.',
            action: {
                instructions: 'To verify your email, please click here:',
                button: {
                    color: '#22BC66', // Optional action button color
                    text: 'Verify your email',
                    link: verificationUrl
                }
            },
            outro: 'Need help, or have questions? Just reply to this email, we\'d love to help.'
        }
    }
}


const forgotPasswordMailgenContent = (username, resetPasswordUrl) => {
    return {
        body: {
            name: username,
            intro: 'Welcome to Bookbazar!',
            action: {
                instructions: 'To reset your password, please click here:',
                button: {
                    color: '#22BC66', // Optional action button color
                    text: 'Reset your password',
                    link: resetPasswordUrl
                }
            },
            outro: 'This link is only valid for 15 mins.\n Need help, or have questions? Just reply to this email, we\'d love to help.'
        }
    }
}

const paymentCompleteMailgenContent = () => {

}

const purchaseSuccessfullMailContent = () => {

}

export {
    sendMail,
    forgotPasswordMailgenContent,
    emailVerificationMailgenContent
}