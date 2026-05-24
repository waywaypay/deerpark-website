import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConsultModalProvider } from "@/components/consult-modal-provider";
import { CanonicalUrl } from "@/lib/canonical";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Products from "@/pages/products";
import Dispatch from "@/pages/dispatch";
import DispatchArchive from "@/pages/dispatch-archive";
import DispatchPost from "@/pages/dispatch-post";
import Sec from "@/pages/sec";
import Admin from "@/pages/admin";
import Privacy from "@/pages/privacy";
import Terms from "@/pages/terms";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/products" component={Products} />
      <Route path="/dispatch" component={Dispatch} />
      <Route path="/dispatch/archive" component={DispatchArchive} />
      <Route path="/dispatch/:id" component={DispatchPost} />
      <Route path="/sec" component={Sec} />
      <Route path="/admin" component={Admin} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ConsultModalProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <CanonicalUrl />
            <Router />
          </WouterRouter>
        </ConsultModalProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
