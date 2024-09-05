const nodemailer = require("nodemailer");
const ejs = require("ejs");
const path = require("path");
const fs = require("fs");
const { handleResponse } = require("../utilities/responseHandlers");

exports.sendMail = async function (
  res,
  subject,
  to,
  hello_content,
  welcome_message,
  body_1_content,
  body_2_content,
  main_url,
  button_1_link,
  button_1_content,
  button_2_link,
  button_2_content,
  footer_content,
  thankyou_note
) {
  return new Promise((resolve, reject) => {
    ejs.renderFile(
      path.join(__dirname, "../template/emailTemplate.ejs"),
      {
        subject: subject,
        hello_content: hello_content,
        user_name: to,
        welcome_message: welcome_message,
        body_1_content: body_1_content,
        body_2_content: body_2_content,
        main_url: main_url,
        button_1_link: button_1_link,
        button_1_content: button_1_content,
        button_2_link: button_2_link,
        button_2_content: button_2_content,
        footer_content: footer_content,
        thankyou_note: thankyou_note,
        app_primary_color: process.env.APP_PRIMARY_COLOR,
        app_secondary_color: process.env.APP_SECONDARY_COLOR,
        logo_img: process.env.LOGO_IMAGE,
        admin_support_email: process.env.ADMIN_SUPPORT_EMAIL,
        support_email: process.env.SUPPORT_EMAIL,
        regards: process.env.REGARDS,
        instagram_link: process.env.INSTA_LINK,
        instagram_img_link: process.env.INSTA_IMAGE,
        facebook_link: process.env.FB_LINK,
        facebook_img_link: process.env.FB_IMAGE,
        twitter_link: process.env.TWITTER_LINK,
        twitter_img_link: process.env.TWITTER_IMAGE,
        terms_of_use_link: process.env.TERMS_OF_USE_LINK,
        privacy_policy_link: process.env.PRIVACY_POLICY_LINK,
      },

      async function (err, data) {
        if (err) {
          console.error("Error rendering email template:", err);
          handleResponse(res, "Internal server error", 500, []);
        } else {
          // send mail thing here
          let transporter = nodemailer.createTransport({
            service: "gmail",
            port: 25, // or 465 if you are using SSL
            secure: false, // true for 465, false for other ports
            auth: {
              user: process.env.EMAIL,
              pass: process.env.PASSWORD,
            },
            tls: {
              rejectUnauthorized: false,
            },
          });

          let mailOptions = {
            from: process.env.EMAIL,
            to: to,
            subject: subject,
            html: data,
          };

          try {
            let info = await transporter.sendMail(mailOptions);
            console.log("Message sent: %s", info.messageId);
            resolve(info);
          } catch (error) {
            console.error("Error sending email:", error);
            reject(error);
          }
        }
      }
    );
  });
};
