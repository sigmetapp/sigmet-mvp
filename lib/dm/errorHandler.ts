/**
 * Centralized error handling for DM system
 * Provides consistent error logging, user-friendly messages, and error reporting
 */

type ErrorContext = {
  component: string;
  action?: string;
  threadId?: string;
  userId?: string;
  [key: string]: unknown;
};

type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

interface DmError extends Error {
  code?: string;
  context?: ErrorContext;
  severity?: ErrorSeverity;
  retryable?: boolean;
}

class DmErrorHandler {
  private static instance: DmErrorHandler | null = null;

  static getInstance(): DmErrorHandler {
    if (!DmErrorHandler.instance) {
      DmErrorHandler.instance = new DmErrorHandler();
    }
    return DmErrorHandler.instance;
  }

  /**
   * Handle error with context
   */
  handle(error: Error | DmError, context: ErrorContext): void {
    const dmError = this.normalizeError(error, context);
    
    // Log error
    this.logError(dmError);
    
    // Report to error tracking service (if available)
    this.reportError(dmError);
    
    // Show user-friendly message (if in browser)
    if (typeof window !== 'undefined') {
      this.showUserMessage(dmError);
    }
  }

  /**
   * Normalize error to DmError format
   */
  private normalizeError(error: Error | DmError, context: ErrorContext): DmError {
    const dmError: DmError = error instanceof Error ? error : new Error(String(error));
    
    // Preserve existing properties
    if ('code' in error) {
      dmError.code = (error as DmError).code;
    }
    if ('severity' in error) {
      dmError.severity = (error as DmError).severity;
    }
    if ('retryable' in error) {
      dmError.retryable = (error as DmError).retryable;
    }
    
    // Add context
    dmError.context = {
      ...(dmError.context || {}),
      ...context,
    };
    
    // Infer severity from error code if not set
    if (!dmError.severity) {
      dmError.severity = this.inferSeverity(dmError);
    }
    
    // Infer retryable from error code if not set
    if (dmError.retryable === undefined) {
      dmError.retryable = this.isRetryable(dmError);
    }
    
    return dmError;
  }

  /**
   * Infer error severity from error code or message
   */
  private inferSeverity(error: DmError): ErrorSeverity {
    const code = error.code || '';
    const message = error.message.toLowerCase();
    
    // Critical errors
    if (
      code === 'AUTH_FAILED' ||
      code === 'FORBIDDEN' ||
      message.includes('unauthorized') ||
      message.includes('forbidden')
    ) {
      return 'critical';
    }
    
    // High severity errors
    if (
      code === 'SYNC_FAILED' ||
      code === 'CONNECTION_ERROR' ||
      message.includes('network') ||
      message.includes('connection')
    ) {
      return 'high';
    }
    
    // Medium severity errors
    if (
      code === 'RATE_LIMITED' ||
      code === 'CONFIG_ERROR' ||
      message.includes('rate limit') ||
      message.includes('timeout')
    ) {
      return 'medium';
    }
    
    // Low severity (default)
    return 'low';
  }

  /**
   * Check if error is retryable
   */
  private isRetryable(error: DmError): boolean {
    const code = error.code || '';
    const message = error.message.toLowerCase();
    
    // Non-retryable errors
    if (
      code === 'AUTH_FAILED' ||
      code === 'FORBIDDEN' ||
      code === 'INVALID_MESSAGE' ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('invalid')
    ) {
      return false;
    }
    
    // Retryable errors
    if (
      code === 'CONNECTION_ERROR' ||
      code === 'SYNC_FAILED' ||
      code === 'NETWORK_ERROR' ||
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('connection')
    ) {
      return true;
    }
    
    // Default: retryable for unknown errors
    return true;
  }

  /**
   * Log error to console
   */
  private logError(error: DmError): void {
    const context = error.context || {};
    const logLevel = this.getLogLevel(error.severity || 'low');
    
    const logMessage = `[DM Error] ${context.component || 'Unknown'}: ${error.message}`;
    const logData = {
      code: error.code,
      severity: error.severity,
      retryable: error.retryable,
      context,
      stack: error.stack,
    };
    
    switch (logLevel) {
      case 'error':
        console.error(logMessage, logData);
        break;
      case 'warn':
        console.warn(logMessage, logData);
        break;
      default:
        console.log(logMessage, logData);
    }
  }

  /**
   * Get console log level from severity
   */
  private getLogLevel(severity: ErrorSeverity): 'error' | 'warn' | 'log' {
    switch (severity) {
      case 'critical':
      case 'high':
        return 'error';
      case 'medium':
        return 'warn';
      default:
        return 'log';
    }
  }

  /**
   * Report error to error tracking service (Sentry, etc.)
   */
  private reportError(error: DmError): void {
    // Only report high/critical severity errors
    if (error.severity !== 'high' && error.severity !== 'critical') {
      return;
    }
    
    // Report to Sentry if available
    if (typeof window !== 'undefined' && (window as any).Sentry) {
      try {
        (window as any).Sentry.captureException(error, {
          tags: {
            component: 'dms',
            errorCode: error.code,
            severity: error.severity,
            retryable: String(error.retryable),
          },
          extra: error.context,
        });
      } catch (reportError) {
        console.error('Failed to report error to Sentry:', reportError);
      }
    }
  }

  /**
   * Show user-friendly error message
   */
  private showUserMessage(error: DmError): void {
    // Only show messages for high/critical errors or user-facing actions
    if (error.severity !== 'high' && error.severity !== 'critical') {
      return;
    }
    
    const userMessage = this.getUserFriendlyMessage(error);
    
    // Dispatch custom event for UI components to handle
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('dm:error', {
          detail: {
            message: userMessage,
            code: error.code,
            severity: error.severity,
            retryable: error.retryable,
            context: error.context,
          },
        })
      );
    }
  }

  /**
   * Get user-friendly error message
   */
  getUserFriendlyMessage(error: DmError): string {
    const code = error.code || '';
    const message = error.message.toLowerCase();
    
    // Network errors
    if (code === 'CONNECTION_ERROR' || code === 'NETWORK_ERROR' || message.includes('network')) {
      return 'Проблема с сетью. Проверьте подключение к интернету.';
    }
    
    // Rate limiting
    if (code === 'RATE_LIMITED' || message.includes('rate limit')) {
      return 'Слишком много сообщений. Подождите немного перед повторной отправкой.';
    }
    
    // Authentication errors
    if (code === 'AUTH_FAILED' || message.includes('unauthorized')) {
      return 'Ошибка авторизации. Пожалуйста, войдите заново.';
    }
    
    // Permission errors
    if (code === 'FORBIDDEN' || message.includes('forbidden')) {
      return 'У вас нет доступа к этому диалогу.';
    }
    
    // Sync errors
    if (code === 'SYNC_FAILED' || message.includes('sync')) {
      return 'Ошибка синхронизации сообщений. Попробуйте обновить страницу.';
    }
    
    // Timeout errors
    if (message.includes('timeout')) {
      return 'Превышено время ожидания. Попробуйте еще раз.';
    }
    
    // Generic error
    return 'Произошла ошибка. Попробуйте еще раз.';
  }

  /**
   * Create error with context
   */
  createError(
    message: string,
    code?: string,
    context?: ErrorContext,
    severity?: ErrorSeverity
  ): DmError {
    const error = new Error(message) as DmError;
    error.code = code;
    error.context = context;
    error.severity = severity;
    return error;
  }
}

// Export singleton instance
export const dmErrorHandler = DmErrorHandler.getInstance();

// Export convenience functions
export function handleDmError(error: Error | DmError, context: ErrorContext): void {
  dmErrorHandler.handle(error, context);
}

export function createDmError(
  message: string,
  code?: string,
  context?: ErrorContext,
  severity?: ErrorSeverity
): DmError {
  return dmErrorHandler.createError(message, code, context, severity);
}

export function getUserFriendlyMessage(error: Error | DmError): string {
  const dmError = error as DmError;
  return dmErrorHandler.getUserFriendlyMessage(dmError);
}

export type { DmError, ErrorContext, ErrorSeverity };
