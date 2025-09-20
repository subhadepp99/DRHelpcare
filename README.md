## MSG91 OTP Widget Server Config

Set environment variables in `.env`:

```
MSG91_AUTHKEY=your_msg91_authkey
MSG91_VERIFY_URL=https://verify.msg91.com/api/otp/verify-access-token
```

Endpoints added:

- POST `/auth/login-msg91` { accessToken }
- POST `/auth/register-msg91` { accessToken, user? }

These validate the access token with MSG91 and then log in or register the user.
