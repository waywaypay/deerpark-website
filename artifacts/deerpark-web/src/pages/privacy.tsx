import { FadeIn, Footer, Navbar } from "@/components/site-layout";

const LAST_UPDATED = "May 2026";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main>
        <section className="pt-32 md:pt-40 pb-20 border-b border-foreground/10">
          <div className="max-w-3xl mx-auto px-6">
            <FadeIn>
              <div className="flex items-center gap-3 mb-8">
                <div className="h-[1px] w-12 bg-primary"></div>
                <span className="section-label">Legal</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-serif mb-4">Privacy Policy</h1>
              <p className="text-sm text-muted-foreground font-light mb-12">
                Last updated: {LAST_UPDATED}
              </p>
            </FadeIn>

            <FadeIn delay={0.05}>
              <div className="space-y-10 text-base text-foreground/90 font-light leading-relaxed">
                <section>
                  <h2 className="text-2xl font-serif mb-3 text-foreground">1. Who we are</h2>
                  <p>
                    DeerPark.io ("DeerPark", "we", "us") is an AI consulting practice operated by
                    DeerPark.io. You can reach us at{" "}
                    <a href="mailto:contact@deerpark.io" className="underline underline-offset-2 hover:text-foreground/70">
                      contact@deerpark.io
                    </a>
                    . This policy explains what information we collect, how we use it, and the
                    choices you have.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-serif mb-3 text-foreground">2. Information we collect</h2>
                  <p className="mb-3">We collect only what you give us directly:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Name, company, work email, and (if you opt in) mobile number you submit through our assessment or contact forms.</li>
                    <li>Quiz answers from our model-fit assessment.</li>
                    <li>Standard server logs (IP address, user agent, request timestamps) for security and abuse prevention.</li>
                  </ul>
                  <p className="mt-3">
                    We do not buy contact information, scrape mobile numbers, or share lists with
                    third-party marketers.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-serif mb-3 text-foreground">3. How we use it</h2>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Reply to your inquiry and send the deployment plan you requested.</li>
                    <li>Send service messages related to engagements you have with us.</li>
                    <li>Operate, secure, and improve the site.</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-2xl font-serif mb-3 text-foreground">4. SMS / text messaging</h2>
                  <p className="mb-3">
                    If you provide your mobile number and check the SMS consent box on our
                    assessment form, you consent to receive text messages from DeerPark related to
                    your assessment and follow-up. Specifically:
                  </p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>
                      <span className="text-foreground">Message types:</span> a confirmation that we
                      received your assessment, and short follow-ups from a DeerPark strategist
                      about scheduling and your tailored deployment plan.
                    </li>
                    <li>
                      <span className="text-foreground">Frequency:</span> message frequency varies;
                      typically fewer than 6 messages per month per user.
                    </li>
                    <li>
                      <span className="text-foreground">Cost:</span> message and data rates may
                      apply, depending on your mobile plan.
                    </li>
                    <li>
                      <span className="text-foreground">Opt-out:</span> reply <code>STOP</code> at
                      any time to stop receiving messages. Reply <code>HELP</code> for help, or
                      email{" "}
                      <a
                        href="mailto:contact@deerpark.io"
                        className="underline underline-offset-2 hover:text-foreground/70"
                      >
                        contact@deerpark.io
                      </a>
                      .
                    </li>
                    <li>
                      <span className="text-foreground">No sharing:</span> mobile numbers and
                      consent records are never sold, rented, or shared with third parties for
                      marketing. They are used only for the messaging described above.
                    </li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-2xl font-serif mb-3 text-foreground">5. Sub-processors</h2>
                  <p>
                    We use Twilio to deliver SMS, and standard cloud infrastructure providers to
                    host our site and database. These vendors process your information only on our
                    instructions and under their own security commitments.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-serif mb-3 text-foreground">6. Retention</h2>
                  <p>
                    We retain assessment responses and contact records for as long as needed to
                    follow up on the engagement and meet our legal obligations. You can request
                    deletion at any time by emailing{" "}
                    <a href="mailto:contact@deerpark.io" className="underline underline-offset-2 hover:text-foreground/70">
                      contact@deerpark.io
                    </a>
                    .
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-serif mb-3 text-foreground">7. Your choices</h2>
                  <p>
                    You can ask us to access, correct, or delete information you have shared. For
                    SMS, you can opt out at any time by replying <code>STOP</code>. We honor opt-out
                    requests by maintaining an internal do-not-contact list.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-serif mb-3 text-foreground">8. Changes to this policy</h2>
                  <p>
                    We will update this page if our practices change. The date at the top reflects
                    the most recent revision.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-serif mb-3 text-foreground">9. Contact</h2>
                  <p>
                    Questions? Email{" "}
                    <a href="mailto:contact@deerpark.io" className="underline underline-offset-2 hover:text-foreground/70">
                      contact@deerpark.io
                    </a>
                    .
                  </p>
                </section>
              </div>
            </FadeIn>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
