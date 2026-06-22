import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

type SendMailOptions = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly configService: ConfigService) {}

  private getTransporter() {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = Number(this.configService.get<number>('SMTP_PORT') || 587);
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (!host) {
      throw new Error('SMTP is not configured. Set SMTP_HOST and SMTP_PORT.');
    }

    const isLocalSmtp =
      host === 'localhost' || host === '127.0.0.1' || host === 'mailpit';

    if (!isLocalSmtp && (!user || !pass)) {
      throw new Error(
        'SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.',
      );
    }

    const transportOptions: SMTPTransport.Options = {
      host,
      port,
      secure: port === 465,
      ...(isLocalSmtp
        ? {}
        : {
            auth: {
              user,
              pass,
            },
          }),
    };

    return nodemailer.createTransport(transportOptions);
  }

  async sendMail(options: SendMailOptions) {
    const from =
      this.configService.get<string>('MAIL_FROM') ||
      this.configService.get<string>('SMTP_USER') ||
      'NexusMsg <no-reply@nexusmsg.local>';

    const transporter = this.getTransporter();

    const result = await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    this.logger.log(`Email sent to ${options.to}: ${result.messageId}`);

    return result;
  }
}