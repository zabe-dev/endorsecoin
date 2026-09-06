import { NextResponse } from 'next/server';

type ApiResponse<T> = {
  success: boolean;
  code: string;
  message: string;
  data: T | null;
};

export function apiSuccess<T>(data: T, message = 'Request completed.') {
  return NextResponse.json<ApiResponse<T>>({
    success: true,
    code: 'OK',
    message,
    data,
  });
}

export function apiError<T = never>(
  code: string,
  message: string,
  status = 400,
  data: T | null = null,
) {
  return NextResponse.json<ApiResponse<T>>(
    {
      success: false,
      code,
      message,
      data,
    },
    { status },
  );
}
