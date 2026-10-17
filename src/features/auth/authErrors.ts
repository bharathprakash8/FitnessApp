import { AuthError } from '@supabase/supabase-js';

export const NO_ACCESS_MESSAGE =
  "We couldn't find an active account for this email. Ask your trainer or admin for access.";

/** Turn Supabase Auth errors into short, friendly messages. */
export function friendlyAuthError(error: unknown): string {
  if (error instanceof AuthError) {
    switch (error.code) {
      case 'otp_disabled':
      case 'signup_disabled':
      case 'user_not_found':
      case 'user_banned':
        return NO_ACCESS_MESSAGE;
      case 'otp_expired':
        return 'That code is wrong or has expired. Check the latest email or ask for a new code.';
      case 'over_email_send_rate_limit':
      case 'over_request_rate_limit':
        return 'Too many tries. Please wait a minute and try again.';
      case 'validation_failed':
      case 'email_address_invalid':
        return 'Please enter a valid email address.';
    }
    if (error.status === 0 || error.name === 'AuthRetryableFetchError') {
      return 'No internet connection. Please check your network and try again.';
    }
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}
