import { ApiError } from "../../utils/api-error.js";
import { db } from "../../utils/db.js";
import { paymentFailedMailgenContent, purchaseSuccessfullMailContent, sendMail } from "../../utils/mail.js"


export const handleNotifyJob = async (job) => {
  try {
    const { orderId, type } = job.data;

    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { user: true },
    });

    // const user = await db.user.findUnique({ where: { id: order.userId } });

    if (type === 'order:paid') {
      const link = ``;
      const mailOptions = {
        email: order.user.email,
        subject: "Order Successfull!",
        mailgenContent: purchaseSuccessfullMailContent(order.user.name, link),
      }
      sendMail(mailOptions);
    }
    else if (type === 'order:payment:failed') {
      const mailOptions = {
        email: order.user.email,
        subject: "Payment Failed!",
        mailgenContent: paymentFailedMailgenContent(order.user.name, orderId),
      }
      sendMail(mailOptions);
    }

    console.log(`Notification sent for order ${orderId}, type=${type}`);
  } catch (err) {
    console.error(`Notify job error for order ${orderId}`, err);
    throw err;
  }
};
