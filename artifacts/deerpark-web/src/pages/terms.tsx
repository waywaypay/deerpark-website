import { FadeIn, SiteHeader, SiteFooter } from "@/components/site-layout";

const LAST_UPDATED = "May 2026";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main>
        <section className="pt-16 md:pt-24 pb-20 border-b border-foreground/10">
          <div className="max-w-3xl mx-auto px-6">
            <FadeIn>
              <div className="flex items-center gap-3 mb-8">
                <div className="h-[1px] w-12 bg-primary"></div>
                <span className="section-label">Legal</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-serif mb-4">Terms of Service</h1>
              <p className="text-sm text-muted-foreground font-light mb-12">
                Last updated: {LAST_UPDATED}
              </p>
            </FadeIn>

            <FadeIn delay={0.05}>
              <div className="space-y-10 text-base text-foreground/90 font-light leading-relaxed">
                <section>
                  <h2 className="text-2xl font-serif mb-3 text-foreground">1. Acceptance</h2>
                  <p>
                    By using deerpark.io or submitting a form on the site, you agree to these
                    terms. If you do not agree, please do not use the site.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-serif mb-3 text-foreground">2. The service</h2>
                  <p>
                    DeerPark.io is the marketing site for DeerPark, an AI consulting practice. The
                    site provides information about our services, a free consultation request
                    form, and ways to contact us. Anything you submit through the site is used to
                    follow up on your inquiry.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-serif mb-3 text-foreground">3. SMS / text messaging</h2>
                  <p className="mb-3">
                    If you provide a mobile number on our consultation form and check the SMS
                    consent box, you agree to receive text messages from DeerPark related to your
                    submission. By opting in:
                  </p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>You confirm the number you provided is yours and you are authorized to receive messages on it.</li>
                    <li>You understand message and data rates may apply.</li>
                    <li>You can opt out any time by replying <code>STOP</code>. Reply <code>HELP</code> for help.</li>
                    <li>Message frequency varies; typically fewer than 6 messages per month per user.</li>
                    <li>Carriers are not liable for delayed or undelivered messages.</li>
                  </ul>
                  <p className="mt-3">
                    Full SMS terms are also described in our{" "}
                    <a href="/privacy" className="underline underline-offset-2 hover:text-foreground/70">
                      Privacy Policy
                    </a>
                    .
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-serif mb-3 text-foreground">4. Acceptable use</h2>
                  <p>
                    Don't use the site to attempt to break it, scrape it at scale, or impersonate
                    others. Do not submit anyone else's contact information without their
                    permission.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-serif mb-3 text-foreground">5. Intellectual property</h2>
                  <p>
                    Content on the site, including the DeerPark name, logo, and written material,
                    is owned by DeerPark.io. Any consultation notes and deployment plan we send
                    you are for your internal use; please don't republish or resell them without
                    our written permission.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-serif mb-3 text-foreground">6. No warranty</h2>
                  <p>
                    The site and any free consultation are provided "as is" without warranties of
                    any kind. Recommendations and content are informational and don't constitute
                    professional advice for your specific situation.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-serif mb-3 text-foreground">7. Limitation of liability</h2>
                  <p>
                    To the fullest extent permitted by law, DeerPark.io is not liable for indirect,
                    incidental, or consequential damages arising from your use of the site or any
                    free content provided through it.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-serif mb-3 text-foreground">8. Changes</h2>
                  <p>
                    We may update these terms over time. The date above reflects the latest
                    revision. Continued use of the site after an update means you accept the new
                    terms.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-serif mb-3 text-foreground">9. Contact</h2>
                  <p>
                    Questions about these terms? Email{" "}
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
      <SiteFooter />
    </div>
  );
}
