declare module 'react-native-razorpay' {
  export type RazorpaySuccess = {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  };

  export type RazorpayOptions = {
    key: string;
    amount?: number;
    currency?: string;
    name?: string;
    description?: string;
    order_id?: string;
    subscription_id?: string;
    retry?: {
      enabled: boolean;
    };
    theme?: {
      color?: string;
    };
  };

  const RazorpayCheckout: {
    open(options: RazorpayOptions): Promise<RazorpaySuccess>;
  };

  export default RazorpayCheckout;
}
