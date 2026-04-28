import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Dispatch from "@/pages/dispatch";
import DispatchArchive from "@/pages/dispatch-archive";
import DispatchPost from "@/pages/dispatch-post";
import CapitalDesk from "@/pages/capital-desk";
import Admin from "@/pages/admin";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dispatch" component={Dispatch} />
      <Route path="/dispatch/archive" component={DispatchArchive} />
      <Route path="/dispatch/:id" component={DispatchPost} />
      <Route path="/capital-desk" component={CapitalDesk} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
