import { loc, View } from 'okta';
import { BaseForm } from '../../internals';
import email from '../shared/email';
import BaseAuthenticatorView from '../../components/BaseAuthenticatorView';
import BaseFormWithPolling from '../../internals/BaseFormWithPolling';
import sessionStorageHelper from '../../../client/sessionStorageHelper';
import { addUserFeedbackCallout } from '../../utils/ResendViewUtil';


const ResendView = View.extend(
  {
    className: 'resend-email-view',
    events: {
      'click a.resend-link' : 'handelResendLink'
    },

    initialize() {
      // could be currentAuthenticatorEnrollment-resend or currentAuthenticator-resend
      this.authenticatorContext = this.options.resendEmailAction.split('-')[0];

      const resendContext = this.options.appState.get(this.authenticatorContext)?.resend;

      if (resendContext) {
        const content = `${loc('email.code.not.received', 'login')}
          <a class='resend-link'>${loc('email.button.resend', 'login')}</a>`;

        this.add(`<div class="ion-messages-container">${content}</div>`);
      }
      // this.add(createCallout({
      //   content: `${loc('email.code.not.received', 'login')}
      //   <a class='resend-link'>${loc('email.button.resend', 'login')}</a>`,
      //   type: 'warning',
      // }));
    },

    handelResendLink() {
      this.options.appState.trigger('invokeAction', this.options.resendEmailAction);
      // Hide warning, but reinitiate to show warning again after some threshold of polling
      // if (!this.$el.hasClass('hide')) {
      //   this.$el.addClass('hide');
      // }
      // this.showCalloutWithDelay();
      sessionStorageHelper.setResendTimestamp(Date.now());

      const contextualData = this.options.appState.get(this.authenticatorContext)?.contextualData;
      const content = contextualData?.email
        ? `${loc('oie.email.code.user.feedback.with.email', 'login', 
          [contextualData.email])}`
        :`${loc('oie.email.code.user.feedback', 'login')}`;

      this.userFeedbackTimeout = addUserFeedbackCallout(content, this);
      
      // this.addUserFeedbackCallout();      
    },

    // addUserFeedbackCallout() {
    //   const messageCallout = createCallout({
    //     content: `${loc('oie.email.code.user.feedback', 'login', 
    //       [this.options.appState.get('currentAuthenticator')?.contextualData?.email || ''])}`,
    //     type: 'info',
    //   });
  
    //   // Get message container from the parent since it's not in the scope of this view
    //   // const messageContainer = this.$el.parent(); 
    //   // messageContainer.prepend(messageCallout.render().el);

    //   this.add(messageCallout, { prepend: true });
  
    //   // Dismiss callout after timeout
    //   this.userFeedbackTimeout = setInterval(() => {
    //     const start = sessionStorageHelper.getResendTimestamp();
    //     const now = Date.now();
    //     if (now - start >= USER_FEEDBACK_TIMEOUT) {
    //       messageCallout.remove();
    //       clearInterval(this.userFeedbackTimeout);
    //     }      
    //   }, 500);
    // },

    // postRender() {
    //   this.showCalloutWithDelay();
    // },

    // showCalloutWithDelay() {
    //   this.showMeTimeout = _.delay(() => {
    //     this.$el.removeClass('hide');
    //   }, SHOW_RESEND_TIMEOUT);
    // },

    remove() {
      View.prototype.remove.apply(this, arguments);
      clearTimeout(this.userFeedbackTimeout);
    }
  },
);

const Body = BaseFormWithPolling.extend(Object.assign(
  {
    save() {
      return loc('mfa.challenge.verify', 'login');
    },
    initialize() {
      BaseFormWithPolling.prototype.initialize.apply(this, arguments);

      this.add(ResendView, {
        selector: '.o-form-error-container',
        options: {
          resendEmailAction: this.resendEmailAction,
        }
      });
      this.startPolling();
    },

    saveForm() {
      BaseForm.prototype.saveForm.apply(this, arguments);
      this.stopPolling();
    },

    remove() {
      BaseForm.prototype.remove.apply(this, arguments);
      this.stopPolling();
    },

    triggerAfterError(model, error) {
      BaseForm.prototype.triggerAfterError.apply(this, arguments);
      const isFormPolling = !!this.polling;
      this.stopPolling();

      if (error.responseJSON?.errorSummaryKeys?.includes('idx.session.expired')) {
        // Do NOT resume polling since session is invalid and polling is already stopped
        return;
      }

      if (this.isRateLimitError(error)) {
        // When polling encounter rate limit error, wait 60 sec for rate limit bucket to reset
        // before polling again & hide error message
        if (isFormPolling) {
          setTimeout(() => {
            model.trigger('clearFormError');
          }, 0);
        }
        this.startPolling(60000);
      } else {
        this.startPolling(this.options.appState.get('dynamicRefreshInterval'));
      }
    },

    isRateLimitError(error) {
      return (error.responseJSON?.errorSummaryKeys?.includes('tooManyRequests') ||
        error.responseJSON?.errorCode === 'E0000047') &&
        !error.responseJSON?.errorIntent;
    },
  },
  email,
));

export default BaseAuthenticatorView.extend({
  Body,
});
